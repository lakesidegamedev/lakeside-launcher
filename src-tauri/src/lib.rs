// Lakeside launcher backend.
//
// Security posture:
// - The launcher window is the only capability-bearing webview.
// - Game windows are created with an external URL and no capability entry, so
//   remote pages cannot reach Tauri IPC or the filesystem.
// - The frontend never chooses a filesystem path outright: it passes a
//   catalog-relative executable string which is resolved under the install
//   root and rejected if it escapes.
// - External URLs and game URLs must be https on Lakeside-owned hosts.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, Instant};

use base64::Engine as _;
use ed25519_dalek::{Signature, VerifyingKey};
use rand::distributions::Alphanumeric;
use rand::Rng;
use serde::{Deserialize, Serialize};
#[cfg(target_os = "windows")]
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
#[cfg(target_os = "windows")]
use tokio::io::AsyncWriteExt;
use url::Url;

/// Hosts the launcher may open in a system browser (sign-in, checkout, docs).
const EXTERNAL_HOSTS: &[&str] = &["lakesidegames.net", "ahousedividedgame.com"];

/// Hosts a game may load inside a launcher-managed webview.
const GAME_HOSTS: &[&str] = &["lakesidegames.net", "ahousedividedgame.com"];

/// Hosts allowed for release artifact downloads. The signed manifest is
/// authoritative, but this keeps a compromised manifest from pointing at an
/// arbitrary origin (and HTTPS is required by validate_url).
#[cfg(target_os = "windows")]
const DOWNLOAD_HOSTS: &[&str] = &["github.com", "githubusercontent.com", "lakesidegames.net"];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallProgress {
    product_id: String,
    downloaded: u64,
    total: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub version: String,
    pub executable: String,
}

#[cfg(target_os = "windows")]
fn installed_executable(product_id: &str) -> Option<&'static str> {
    match product_id {
        // Tauri NSIS installs per-user into %LOCALAPPDATA%\AHDClient.
        "ahd" => Some("AHDClient/ahdclient-desktop.exe"),
        _ => None,
    }
}

/// Signed release manifest and the Ed25519 public key that verifies it.
const MANIFEST_URL: &str = "https://lakesidegames.net/download/launcher/manifest.json";
const MANIFEST_PUBLIC_KEY: &str = "RTeyfbwD+bi3VP0eazWkQgeyzz/fLM7ePOaaAqH1xoE=";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestArtifact {
    pub name: String,
    pub kind: String,
    pub url: String,
    pub size: Option<u64>,
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestProduct {
    pub name: String,
    pub version: String,
    pub tag: String,
    pub published_at: Option<String>,
    pub notes_url: Option<String>,
    pub artifacts: HashMap<String, ManifestArtifact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseManifest {
    pub schema: u32,
    pub channel: String,
    pub generated_at: String,
    pub products: HashMap<String, ManifestProduct>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SignInStart {
    return_url: String,
    state: String,
}

fn host_allowed(host: &str, allowed: &[&str]) -> bool {
    allowed
        .iter()
        .any(|candidate| host == *candidate || host.ends_with(&format!(".{candidate}")))
}

fn validate_url(raw: &str, allowed: &[&str]) -> Result<Url, String> {
    let parsed = Url::parse(raw).map_err(|_| "That address is not a valid URL.".to_string())?;
    if parsed.scheme() != "https" {
        return Err("Only https addresses are allowed.".to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Addresses with embedded credentials are not allowed.".to_string());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "That address has no host.".to_string())?;
    if !host_allowed(host, allowed) {
        return Err(format!("{host} is not a Lakeside host."));
    }
    Ok(parsed)
}

fn install_root(app: &AppHandle) -> PathBuf {
    if let Ok(value) = std::env::var("LAKESIDE_INSTALL_ROOT") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    // Tauri NSIS installs per-user to %LOCALAPPDATA%\AHDClient, so the catalog
    // path AHDClient/ahdclient-desktop.exe resolves from LOCALAPPDATA.
    #[cfg(target_os = "windows")]
    {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            if !local.trim().is_empty() {
                return PathBuf::from(local);
            }
        }
    }
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("products"))
        .unwrap_or_else(|_| PathBuf::from("products"))
}

/// Resolve a catalog-relative executable under the install root.
fn safe_join(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let rel = Path::new(relative);
    if rel.as_os_str().is_empty() {
        return Err("No executable is configured for this build.".to_string());
    }
    if rel.is_absolute() {
        return Err("Executable paths must be relative to the install root.".to_string());
    }
    if rel
        .components()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("Executable paths may not contain . or .. segments.".to_string());
    }

    let canonical_root = root
        .canonicalize()
        .map_err(|_| "The install directory does not exist yet.".to_string())?;
    let candidate = canonical_root.join(rel);
    let canonical = candidate
        .canonicalize()
        .map_err(|_| "That game is not installed yet.".to_string())?;
    if !canonical.starts_with(&canonical_root) {
        return Err("Executable resolves outside the install root.".to_string());
    }
    if !canonical.is_file() {
        return Err("The game executable is missing.".to_string());
    }
    Ok(canonical)
}

fn query_param(target: &str, key: &str) -> Option<String> {
    let query = target.split_once('?')?.1;
    for pair in query.split('&') {
        let (name, value) = pair.split_once('=').unwrap_or((pair, ""));
        if name == key && !value.is_empty() {
            return Some(value.to_string());
        }
    }
    None
}

/// Launch an installed game. The path is resolved under the install root and
/// must name a real file; the process is detached so closing the launcher does
/// not kill the game.
#[tauri::command]
fn launch_product(app: AppHandle, product_id: String, executable: String) -> Result<(), String> {
    if product_id.is_empty()
        || product_id.len() > 64
        || !product_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err("Invalid product id.".to_string());
    }

    let root = install_root(&app);
    let binary = safe_join(&root, &executable)?;
    let working_dir = binary
        .parent()
        .ok_or_else(|| "The game executable has no parent directory.".to_string())?
        .to_path_buf();

    let mut command = std::process::Command::new(&binary);
    command.current_dir(working_dir);
    command.stdin(std::process::Stdio::null());
    command.stdout(std::process::Stdio::null());
    command.stderr(std::process::Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not start the game: {error}"))
}

/// Open a game inside a dedicated window with no launcher capabilities. Reuses
/// an existing window for the same product.
#[tauri::command]
fn open_web_game(
    app: AppHandle,
    product_id: String,
    url: String,
    title: String,
) -> Result<(), String> {
    if product_id.is_empty()
        || product_id.len() > 64
        || !product_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err("Invalid product id.".to_string());
    }

    let parsed = validate_url(&url, GAME_HOSTS)?;
    let label = format!("game-{product_id}");

    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    let safe_title: String = title.chars().take(120).collect();
    let window_title = if safe_title.trim().is_empty() {
        "Lakeside".to_string()
    } else {
        safe_title
    };

    WebviewWindowBuilder::new(&app, label, WebviewUrl::External(parsed))
        .title(window_title)
        .inner_size(1280.0, 800.0)
        .min_inner_size(900.0, 600.0)
        .center()
        .build()
        .map(|_| ())
        .map_err(|error| format!("Could not open the game window: {error}"))
}

/// Open a system browser for sign-in or checkout. Only Lakeside hosts and
/// https are accepted, so a compromised frontend cannot use this as a generic
/// URL opener.
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let parsed = validate_url(&url, EXTERNAL_HOSTS)?;

    #[cfg(target_os = "linux")]
    {
        return std::process::Command::new("xdg-open")
            .arg(parsed.as_str())
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Could not open the browser: {error}"));
    }

    #[cfg(target_os = "macos")]
    {
        return std::process::Command::new("open")
            .arg(parsed.as_str())
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Could not open the browser: {error}"));
    }

    #[cfg(target_os = "windows")]
    {
        return std::process::Command::new("cmd")
            .args(["/C", "start", "", parsed.as_str()])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Could not open the browser: {error}"));
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        let _ = parsed;
        Err("Opening a browser is not supported on this platform.".to_string())
    }
}

/// Start a loopback listener for the browser handoff, then return the URL the
/// caller should hand to lakeside-auth. The port range is narrow so the broker
/// can allow exactly these ports and no others.
#[tauri::command]
fn begin_sign_in(app: AppHandle) -> Result<SignInStart, String> {
    let listener = (47832u16..=47841)
        .find_map(|port| TcpListener::bind(("127.0.0.1", port)).ok())
        .ok_or_else(|| {
            "No launcher sign-in port is available (tried 47832-47841).".to_string()
        })?;
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("Could not configure the sign-in listener: {error}"))?;

    let port = listener
        .local_addr()
        .map_err(|error| format!("Could not read the sign-in port: {error}"))?
        .port();

    let state: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(32)
        .map(char::from)
        .collect();
    let expected_state = state.clone();

    std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(180);
        while Instant::now() < deadline {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                    let mut buffer = [0u8; 8192];
                    let read = stream.read(&mut buffer).unwrap_or(0);
                    let request = String::from_utf8_lossy(&buffer[..read]);
                    let target = request
                        .lines()
                        .next()
                        .and_then(|line| line.split_whitespace().nth(1))
                        .unwrap_or("/");

                    let code = query_param(target, "code");
                    let returned_state = query_param(target, "state");
                    let accepted = returned_state.as_deref() == Some(expected_state.as_str());

                    let (status, message) = if accepted && code.is_some() {
                        ("200 OK", "Signed in. You can close this tab and return to the launcher.")
                    } else {
                        ("400 Bad Request", "Sign-in could not be completed. Return to the launcher and try again.")
                    };
                    let body = format!(
                        "<!doctype html><meta charset=\"utf-8\"><title>Lakeside sign-in</title><body style=\"font-family:system-ui;background:#0e1016;color:#e9eaf0;padding:48px;max-width:520px;margin:auto\"><h1 style=\"font-size:20px\">Lakeside</h1><p>{message}</p></body>"
                    );
                    let response = format!(
                        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                        body.len()
                    );
                    let _ = stream.write_all(response.as_bytes());
                    let _ = stream.flush();

                    if accepted {
                        if let Some(code) = code {
                            let _ = app.emit("sign-in-code", code);
                        }
                    }
                    break;
                }
                Err(ref error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(60));
                }
                Err(_) => break,
            }
        }
    });

    Ok(SignInStart {
        return_url: format!("http://127.0.0.1:{port}/callback?state={state}"),
        state,
    })
}

fn verify_with_key(
    payload: &[u8],
    signature_b64: &str,
    public_key_b64: &str,
) -> Result<(), String> {
    let engine = base64::engine::general_purpose::STANDARD;
    let signature_bytes = engine
        .decode(signature_b64.trim())
        .map_err(|_| "Release manifest signature is not valid base64.".to_string())?;
    let signature = Signature::from_slice(&signature_bytes)
        .map_err(|_| "Release manifest signature has the wrong length.".to_string())?;
    let key_bytes = engine
        .decode(public_key_b64.trim())
        .map_err(|_| "Release manifest public key is not valid base64.".to_string())?;
    let key_array: [u8; 32] = key_bytes
        .try_into()
        .map_err(|_| "Release manifest public key has the wrong length.".to_string())?;
    let key = VerifyingKey::from_bytes(&key_array)
        .map_err(|_| "Release manifest public key is not a valid Ed25519 key.".to_string())?;
    key.verify_strict(payload, &signature)
        .map_err(|_| "Release manifest signature did not verify.".to_string())
}

fn verify_manifest_signature(payload: &[u8], signature_b64: &str) -> Result<(), String> {
    verify_with_key(payload, signature_b64, MANIFEST_PUBLIC_KEY)
}

/// Fetch the published release manifest and verify its detached signature
/// before parsing. The signature covers the exact bytes on the wire, so the
/// file can be served by any static host.
pub async fn load_release_manifest() -> Result<ReleaseManifest, String> {
    let client = reqwest::Client::builder()
        .user_agent("lakeside-launcher")
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| format!("Could not build the release client: {error}"))?;

    let payload = client
        .get(MANIFEST_URL)
        .send()
        .await
        .map_err(|error| format!("Could not reach the release manifest: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Release manifest returned {error}"))?
        .bytes()
        .await
        .map_err(|error| format!("Could not read the release manifest: {error}"))?;

    let signature = client
        .get(format!("{MANIFEST_URL}.sig"))
        .send()
        .await
        .map_err(|error| format!("Could not reach the manifest signature: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Manifest signature returned {error}"))?
        .text()
        .await
        .map_err(|error| format!("Could not read the manifest signature: {error}"))?;

    verify_manifest_signature(&payload, &signature)?;

    serde_json::from_slice(&payload)
        .map_err(|error| format!("Release manifest is malformed: {error}"))
}

#[tauri::command]
async fn get_release_manifest() -> Result<ReleaseManifest, String> {
    load_release_manifest().await
}

#[tauri::command]
fn is_installed(app: AppHandle, executable: String) -> bool {
    safe_join(&install_root(&app), &executable).is_ok()
}

/// Core installer, separated from the Tauri command so the Windows CI probe
/// exercises the same download, hash, install and path-check path.
pub async fn install_artifact<F>(
    install_root: PathBuf,
    product_id: &str,
    version: &str,
    url: &str,
    sha256: &str,
    file_name: &str,
    kind: &str,
    on_progress: F,
) -> Result<InstallResult, String>
where
    F: Fn(u64, Option<u64>) + Send,
{
    if product_id.is_empty()
        || product_id.len() > 64
        || !product_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        return Err("Invalid product id.".to_string());
    }
    if kind != "nsis" {
        return Err(format!(
            "Automatic installation does not support the {kind} package format yet."
        ));
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (&install_root, version, url, sha256, file_name, &on_progress);
        return Err("Automatic game installation is currently Windows-only. Download the installer from the game's release page.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let parsed = validate_url(url, DOWNLOAD_HOSTS)?;
        let safe_name = Path::new(file_name)
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.is_empty() && name.len() <= 200)
            .ok_or_else(|| "The release asset name is invalid.".to_string())?
            .to_string();

        let client = reqwest::Client::builder()
            .user_agent("lakeside-launcher")
            .timeout(Duration::from_secs(900))
            .build()
            .map_err(|error| format!("Could not build the download client: {error}"))?;

        let mut response = client
            .get(parsed)
            .send()
            .await
            .map_err(|error| format!("Could not download the game: {error}"))?
            .error_for_status()
            .map_err(|error| format!("Game download returned {error}"))?;

        validate_url(response.url().as_str(), DOWNLOAD_HOSTS)?;
        let total = response.content_length();

        let directory = std::env::temp_dir().join("lakeside-launcher-downloads");
        tokio::fs::create_dir_all(&directory)
            .await
            .map_err(|error| format!("Could not create the download directory: {error}"))?;
        let destination = directory.join(&safe_name);
        let mut file = tokio::fs::File::create(&destination)
            .await
            .map_err(|error| format!("Could not write the download: {error}"))?;

        let mut hasher = Sha256::new();
        let mut downloaded: u64 = 0;
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| format!("Game download stopped: {error}"))?
        {
            file.write_all(&chunk)
                .await
                .map_err(|error| format!("Could not write the download: {error}"))?;
            hasher.update(&chunk);
            downloaded += chunk.len() as u64;
            on_progress(downloaded, total);
        }
        file.flush()
            .await
            .map_err(|error| format!("Could not finish the download: {error}"))?;
        drop(file);

        let digest = hasher.finalize();
        let actual: String = digest.iter().map(|byte| format!("{byte:02x}")).collect();
        if !actual.eq_ignore_ascii_case(sha256.trim()) {
            let _ = tokio::fs::remove_file(&destination).await;
            return Err("Download did not match the signed release manifest.".to_string());
        }

        let status = std::process::Command::new(&destination)
            .arg("/S")
            .status()
            .map_err(|error| format!("Could not start the installer: {error}"))?;
        let _ = tokio::fs::remove_file(&destination).await;
        if !status.success() {
            return Err("The installer reported a failure.".to_string());
        }

        let executable = installed_executable(product_id).ok_or_else(|| {
            "Automatic installation is not configured for this product.".to_string()
        })?;
        safe_join(&install_root, executable).map_err(|_| {
            "The installer finished but the game executable was not found.".to_string()
        })?;

        Ok(InstallResult {
            version: version.to_string(),
            executable: executable.to_string(),
        })
    }
}

#[tauri::command]
async fn install_release(
    app: AppHandle,
    product_id: String,
    version: String,
    url: String,
    sha256: String,
    file_name: String,
    kind: String,
) -> Result<InstallResult, String> {
    let progress_product = product_id.clone();
    install_artifact(
        install_root(&app),
        &product_id,
        &version,
        &url,
        &sha256,
        &file_name,
        &kind,
        move |downloaded, total| {
            let _ = app.emit(
                "install-progress",
                InstallProgress {
                    product_id: progress_product.clone(),
                    downloaded,
                    total,
                },
            );
        },
    )
    .await
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformSession {
    pub username: String,
    pub email: Option<String>,
    pub provider: String,
    pub avatar_url: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSession {
    token: String,
    session: PlatformSession,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionResponse {
    token: String,
    session: PlatformSession,
}

#[derive(Deserialize)]
struct EntitlementsResponse {
    entitlements: HashMap<String, String>,
}

fn platform_base() -> String {
    std::env::var("LAKESIDE_PLATFORM_API")
        .unwrap_or_else(|_| "https://lakesidegames.net".to_string())
        .trim_end_matches('/')
        .to_string()
}

fn session_file(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join("session.json"))
        .map_err(|error| format!("Could not resolve the app config directory: {error}"))
}

fn write_session(app: &AppHandle, stored: &StoredSession) -> Result<(), String> {
    let path = session_file(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create the session directory: {error}"))?;
    }
    let body = serde_json::to_vec(stored)
        .map_err(|error| format!("Could not encode the session: {error}"))?;
    let temporary = path.with_extension("json.tmp");
    std::fs::write(&temporary, body)
        .map_err(|error| format!("Could not write the session: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&temporary, std::fs::Permissions::from_mode(0o600));
    }
    std::fs::rename(&temporary, &path)
        .map_err(|error| format!("Could not finalize the session: {error}"))
}

fn read_session(app: &AppHandle) -> Result<Option<StoredSession>, String> {
    let path = session_file(app)?;
    match std::fs::read(&path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|error| format!("The stored session is unreadable: {error}")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Could not read the session: {error}")),
    }
}

fn parse_session_response(bytes: &[u8]) -> Result<(String, PlatformSession), String> {
    let parsed: SessionResponse = serde_json::from_slice(bytes)
        .map_err(|error| format!("The platform returned an invalid session: {error}"))?;
    if parsed.token.trim().is_empty() || parsed.session.username.trim().is_empty() {
        return Err("The platform returned an empty session.".to_string());
    }
    Ok((parsed.token, parsed.session))
}

fn parse_entitlements(bytes: &[u8]) -> Result<HashMap<String, String>, String> {
    let parsed: EntitlementsResponse = serde_json::from_slice(bytes)
        .map_err(|error| format!("The platform returned invalid entitlements: {error}"))?;
    Ok(parsed.entitlements)
}

#[tauri::command]
fn platform_session(app: AppHandle) -> Result<Option<PlatformSession>, String> {
    Ok(read_session(&app)?.map(|stored| stored.session))
}

/// Redeem a browser handoff code through lakeside-accounts and persist the
/// resulting launcher session. The token never enters the webview.
#[tauri::command]
async fn platform_exchange(app: AppHandle, code: String) -> Result<PlatformSession, String> {
    if code.trim().is_empty() || code.len() > 2048 {
        return Err("The sign-in code is invalid.".to_string());
    }
    let client = reqwest::Client::builder()
        .user_agent("lakeside-launcher")
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| format!("Could not build the platform client: {error}"))?;

    let body = serde_json::json!({ "code": code }).to_string();
    let response = client
        .post(format!("{}/launcher/session", platform_base()))
        .header("content-type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|error| format!("Could not reach the Lakeside platform: {error}"))?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED
        || response.status() == reqwest::StatusCode::BAD_REQUEST
    {
        return Err("Sign-in could not be completed. Try again.".to_string());
    }

    let bytes = response
        .error_for_status()
        .map_err(|error| format!("The Lakeside platform returned {error}"))?
        .bytes()
        .await
        .map_err(|error| format!("Could not read the platform response: {error}"))?;

    let (token, session) = parse_session_response(&bytes)?;
    write_session(
        &app,
        &StoredSession {
            token,
            session: session.clone(),
        },
    )?;
    Ok(session)
}

#[tauri::command]
async fn platform_entitlements(app: AppHandle) -> Result<HashMap<String, String>, String> {
    let stored = read_session(&app)?
        .ok_or_else(|| "You are not signed in to the Lakeside platform.".to_string())?;

    let client = reqwest::Client::builder()
        .user_agent("lakeside-launcher")
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| format!("Could not build the platform client: {error}"))?;

    let response = client
        .get(format!("{}/launcher/entitlements", platform_base()))
        .bearer_auth(&stored.token)
        .send()
        .await
        .map_err(|error| format!("Could not reach the Lakeside platform: {error}"))?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        if let Ok(path) = session_file(&app) {
            let _ = std::fs::remove_file(path);
        }
        return Err("Your Lakeside session expired. Sign in again.".to_string());
    }

    let bytes = response
        .error_for_status()
        .map_err(|error| format!("The Lakeside platform returned {error}"))?
        .bytes()
        .await
        .map_err(|error| format!("Could not read the platform response: {error}"))?;

    parse_entitlements(&bytes)
}

#[tauri::command]
fn platform_sign_out(app: AppHandle) -> Result<(), String> {
    if let Ok(path) = session_file(&app) {
        match std::fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("Could not clear the session: {error}")),
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            launch_product,
            open_web_game,
            open_external,
            begin_sign_in,
            get_release_manifest,
            is_installed,
            install_release,
            platform_session,
            platform_exchange,
            platform_entitlements,
            platform_sign_out
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Lakeside launcher");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_allowlist_matches_subdomains_only() {
        assert!(host_allowed("lakesidegames.net", EXTERNAL_HOSTS));
        assert!(host_allowed("auth.lakesidegames.net", EXTERNAL_HOSTS));
        assert!(!host_allowed("evillakesidegames.net", EXTERNAL_HOSTS));
        assert!(!host_allowed("lakesidegames.net.evil.test", EXTERNAL_HOSTS));
    }

    #[test]
    fn rejects_non_https_and_foreign_hosts() {
        assert!(validate_url("http://lakesidegames.net", EXTERNAL_HOSTS).is_err());
        assert!(validate_url("https://example.com/", EXTERNAL_HOSTS).is_err());
        assert!(validate_url("https://lakesidegames.net/account", EXTERNAL_HOSTS).is_ok());
    }

    #[test]
    fn parses_callback_query() {
        assert_eq!(
            query_param("/callback?state=abc&code=xyz", "code"),
            Some("xyz".to_string())
        );
        assert_eq!(
            query_param("/callback?state=abc&code=xyz", "state"),
            Some("abc".to_string())
        );
        assert_eq!(query_param("/callback?state=abc", "code"), None);
    }

    #[test]
    fn verifies_manifest_signature_over_exact_bytes() {
        use ed25519_dalek::{Signer, SigningKey};

        let signing_key = SigningKey::from_bytes(&[9u8; 32]);
        let payload = b"{\n  \"schema\": 1\n}\n";
        let engine = base64::engine::general_purpose::STANDARD;
        let signature = engine.encode(signing_key.sign(payload).to_bytes());
        let public_key = engine.encode(signing_key.verifying_key().to_bytes());

        verify_with_key(payload, &signature, &public_key).expect("signature should verify");
        assert!(verify_with_key(b"{}", &signature, &public_key).is_err());
    }

    #[test]
    fn resolves_executables_only_inside_the_install_root() {
        use std::fs;

        let root = std::env::temp_dir().join(format!("lakeside-paths-{}", std::process::id()));
        fs::create_dir_all(root.join("game")).expect("create temp root");
        fs::write(root.join("game").join("game.exe"), b"binary").expect("write exe");

        assert!(safe_join(&root, "game/game.exe").is_ok());
        assert!(safe_join(&root, "../game.exe").is_err());
        assert!(safe_join(&root, "/etc/passwd").is_err());
        assert!(safe_join(&root, "game/missing.exe").is_err());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn parses_platform_session_and_entitlements() {
        let bytes = br#"{"token":"tok","session":{"username":"player","email":"p@example.com","provider":"discord","avatarUrl":null}}"#;
        let (token, session) = parse_session_response(bytes).expect("session");
        assert_eq!(token, "tok");
        assert_eq!(session.username, "player");
        assert_eq!(session.provider, "discord");

        let entitlements =
            parse_entitlements(br#"{"entitlements":{"ahd-client":"owned"}}"#).expect("entitlements");
        assert_eq!(entitlements.get("ahd-client").map(String::as_str), Some("owned"));

        assert!(parse_session_response(b"{}").is_err());
        assert!(parse_entitlements(b"{}").is_err());
    }
}

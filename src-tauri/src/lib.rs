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

mod installer;

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use base64::Engine as _;
use ed25519_dalek::{Signature, VerifyingKey};
use rand::distributions::Alphanumeric;
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tokio::io::AsyncWriteExt;
use url::Url;

/// Hosts the launcher may open in a system browser (sign-in, checkout, docs).
const EXTERNAL_HOSTS: &[&str] = &["lakesidegames.net", "ahousedividedgame.com"];

/// Hosts a game may load inside a launcher-managed webview.
const GAME_HOSTS: &[&str] = &["lakesidegames.net", "ahousedividedgame.com"];

/// Hosts allowed for release artifact downloads. The signed manifest is
/// authoritative, but this keeps a compromised manifest from pointing at an
/// arbitrary origin (and HTTPS is required by validate_url). The R2 host is the
/// presigned target of the accounts download redirect for paid builds.
const DOWNLOAD_HOSTS: &[&str] = &[
    "github.com",
    "githubusercontent.com",
    "lakesidegames.net",
    "r2.cloudflarestorage.com",
];

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
    /// "install", "update" or "reinstall".
    pub action: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledProduct {
    pub version: String,
    pub executable: String,
    #[serde(default)]
    pub installed_at: u64,
}

type InstallState = HashMap<String, InstalledProduct>;

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn install_state_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join("installs.json"))
        .map_err(|error| format!("Could not resolve the app config directory: {error}"))
}

fn read_install_state(app: &AppHandle) -> InstallState {
    let Ok(path) = install_state_path(app) else {
        return InstallState::new();
    };
    match std::fs::read(&path) {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => InstallState::new(),
    }
}

fn write_install_state(app: &AppHandle, state: &InstallState) -> Result<(), String> {
    let path = install_state_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create the install state directory: {error}"))?;
    }
    let body = serde_json::to_vec(state)
        .map_err(|error| format!("Could not encode the install state: {error}"))?;
    let temporary = path.with_extension("json.tmp");
    std::fs::write(&temporary, body)
        .map_err(|error| format!("Could not write the install state: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&temporary, std::fs::Permissions::from_mode(0o600));
    }
    std::fs::rename(&temporary, &path)
        .map_err(|error| format!("Could not finalize the install state: {error}"))
}

fn record_install(
    app: &AppHandle,
    product_id: &str,
    version: &str,
    executable: &str,
) -> Result<(), String> {
    let mut state = read_install_state(app);
    state.insert(
        product_id.to_string(),
        InstalledProduct {
            version: version.to_string(),
            executable: executable.to_string(),
            installed_at: now_millis(),
        },
    );
    write_install_state(app, &state)
}

/// Read the installed version from the per-user uninstall registry entry that
/// the Tauri NSIS installer writes.
#[cfg(target_os = "windows")]
pub fn windows_installed_version(display_name: &str) -> Option<String> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
    use winreg::RegKey;

    let uninstall = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(r"Software\Microsoft\Windows\CurrentVersion\Uninstall", KEY_READ)
        .ok()?;

    for name in uninstall.enum_keys().flatten() {
        let Ok(key) = uninstall.open_subkey_with_flags(&name, KEY_READ) else {
            continue;
        };
        let display: String = key.get_value("DisplayName").unwrap_or_default();
        if display == display_name {
            if let Ok(version) = key.get_value::<String, _>("DisplayVersion") {
                return Some(version);
            }
        }
    }
    None
}

/// Read DisplayVersion for an Inno Setup product from its AppId uninstall key
/// (per-user first, then all-users).
#[cfg(target_os = "windows")]
pub fn windows_inno_installed_version(product_id: &str) -> Option<String> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    let subkey = installer::inno_uninstall_subkey(installer::inno_app_id(product_id)?);
    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        let Ok(key) = RegKey::predef(hive).open_subkey_with_flags(&subkey, KEY_READ) else {
            continue;
        };
        if let Ok(version) = key.get_value::<String, _>("DisplayVersion") {
            if !version.trim().is_empty() {
                return Some(version);
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn installed_executable(product_id: &str) -> Option<&'static str> {
    match product_id {
        // Tauri NSIS installs per-user into %LOCALAPPDATA%\AHDClient.
        "ahd" => Some("AHDClient/ahdclient-desktop.exe"),
        other => installer::windows_inno_executable(other),
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
    port: u16,
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

/// Ask lakeside-accounts for a single-use handoff code bound to the game's
/// client id. Any failure, including a 5 second timeout, returns None so the
/// game still launches. The code is never logged or stored.
async fn fetch_handoff_code(app: &AppHandle, client_id: &str) -> Option<String> {
    let stored = read_session(app).ok().flatten()?;
    let client = reqwest::Client::builder()
        .user_agent("lakeside-launcher")
        .timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .ok()?;
    let response = client
        .post(format!("{}/account/launcher/handoff", platform_base()))
        .bearer_auth(&stored.token)
        .json(&serde_json::json!({ "clientId": client_id }))
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let bytes = response.bytes().await.ok()?;
    installer::parse_handoff_code(&bytes)
}

/// Launch an installed game. The path is resolved under the install root and
/// must name a real file; the process is detached so closing the launcher does
/// not kill the game. Games that opt in (`handoff_client_id`) get the launcher
/// environment and, when signed in, a handoff code.
#[tauri::command]
async fn launch_product(
    app: AppHandle,
    product_id: String,
    executable: String,
    handoff_client_id: Option<String>,
) -> Result<(), String> {
    if !installer::valid_id(&product_id) {
        return Err("Invalid product id.".to_string());
    }
    if let Some(client_id) = handoff_client_id.as_deref() {
        if !installer::valid_id(client_id) {
            return Err("Invalid handoff client id.".to_string());
        }
    }

    let root = install_root(&app);
    let binary = safe_join(&root, &executable)?;
    spawn_game(&app, &binary, handoff_client_id.as_deref()).await
}

/// Start a game binary detached from the launcher. Games that opt in
/// (`handoff_client_id`) get the launcher environment and, when signed in, a
/// handoff code.
async fn spawn_game(
    app: &AppHandle,
    binary: &Path,
    handoff_client_id: Option<&str>,
) -> Result<(), String> {
    let working_dir = binary
        .parent()
        .ok_or_else(|| "The game executable has no parent directory.".to_string())?
        .to_path_buf();

    let mut command = std::process::Command::new(binary);
    command.current_dir(working_dir);
    command.stdin(std::process::Stdio::null());
    command.stdout(std::process::Stdio::null());
    command.stderr(std::process::Stdio::null());

    if let Some(client_id) = handoff_client_id {
        let code = fetch_handoff_code(app, client_id).await;
        command.env_remove("LAKESIDE_HANDOFF_CODE");
        for (key, value) in installer::launch_env(env!("CARGO_PKG_VERSION"), code.as_deref()) {
            command.env(key, value);
        }
    }

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

/// A Lakeside desktop app found through its own Windows uninstall entry.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopApp {
    pub version: String,
    pub install_location: String,
    #[serde(skip)]
    pub executable: PathBuf,
}

/// Find an installed Lakeside desktop app by display name and publisher in the
/// uninstall registry (per-user first, then all-users).
#[cfg(target_os = "windows")]
fn find_desktop_app(product_id: &str) -> Option<DesktopApp> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    let display_name = installer::desktop_app_display_name(product_id)?;
    let paths = [
        (HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
        (
            HKEY_LOCAL_MACHINE,
            r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
    ];
    for (hive, path) in paths {
        let Ok(uninstall) = RegKey::predef(hive).open_subkey_with_flags(path, KEY_READ) else {
            continue;
        };
        for name in uninstall.enum_keys().flatten() {
            let Ok(key) = uninstall.open_subkey_with_flags(&name, KEY_READ) else {
                continue;
            };
            let display: String = key.get_value("DisplayName").unwrap_or_default();
            let publisher: String = key.get_value("Publisher").unwrap_or_default();
            if display.trim() != display_name || publisher.trim() != installer::DESKTOP_APP_PUBLISHER {
                continue;
            }
            let version: String = key.get_value("DisplayVersion").unwrap_or_default();
            let location: String = key
                .get_value::<String, _>("InstallLocation")
                .unwrap_or_default()
                .trim()
                .trim_matches('"')
                .to_string();
            let icon: Option<String> = key
                .get_value::<String, _>("DisplayIcon")
                .ok()
                .and_then(|value| installer::exe_from_display_icon(&value));
            let executable = match icon {
                Some(path) => PathBuf::from(path),
                None if !location.is_empty() => Path::new(&location).join(format!("{display_name}.exe")),
                None => continue,
            };
            if !executable.is_file() {
                continue;
            }
            let install_location = if location.is_empty() {
                executable
                    .parent()
                    .map(|dir| dir.to_string_lossy().to_string())
                    .unwrap_or_default()
            } else {
                location
            };
            return Some(DesktopApp {
                version: version.trim().to_string(),
                install_location,
                executable,
            });
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
fn find_desktop_app(_product_id: &str) -> Option<DesktopApp> {
    None
}

/// Installed desktop app info (version and folder) for the product, if any.
#[tauri::command]
fn detect_desktop_app(product_id: String) -> Option<DesktopApp> {
    find_desktop_app(&product_id)
}

/// Launch a registry-detected desktop app. The path is re-read from the
/// registry here, never taken from the UI.
#[tauri::command]
async fn launch_desktop_app(
    app: AppHandle,
    product_id: String,
    handoff_client_id: Option<String>,
) -> Result<(), String> {
    if let Some(client_id) = handoff_client_id.as_deref() {
        if !installer::valid_id(client_id) {
            return Err("Invalid handoff client id.".to_string());
        }
    }
    let found = find_desktop_app(&product_id)
        .ok_or_else(|| "That app is not installed on this computer.".to_string())?;
    spawn_game(&app, &found.executable, handoff_client_id.as_deref()).await
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
        port,
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

/// Where the installer bytes come from.
pub enum DownloadSource {
    /// A manifest URL on an allowlisted public host (free products).
    Url(String),
    /// The accounts download endpoint: authenticated with the stored session,
    /// answered with a 302 to a short-lived storage URL.
    Account {
        base: String,
        commercial_id: String,
        token: String,
    },
}

async fn download_to_file<F>(
    source: &DownloadSource,
    destination: &Path,
    on_progress: &F,
) -> Result<String, String>
where
    F: Fn(u64, Option<u64>) + Send,
{
    let mut response = match source {
        DownloadSource::Url(url) => {
            let parsed = validate_url(url, DOWNLOAD_HOSTS)?;
            let client = reqwest::Client::builder()
                .user_agent("lakeside-launcher")
                .timeout(Duration::from_secs(900))
                .build()
                .map_err(|error| format!("Could not build the download client: {error}"))?;
            let response = client
                .get(parsed)
                .send()
                .await
                .map_err(|error| format!("Could not download the game: {error}"))?
                .error_for_status()
                .map_err(|error| format!("Game download returned {error}"))?;
            validate_url(response.url().as_str(), DOWNLOAD_HOSTS)?;
            response
        }
        DownloadSource::Account {
            base,
            commercial_id,
            token,
        } => {
            let platform = installer::download_platform(
                std::env::consts::OS,
                std::env::consts::ARCH,
            )
            .ok_or_else(|| "This platform has no Lakeside download.".to_string())?;
            let endpoint = installer::account_download_url(base, commercial_id, platform)?;
            let endpoint_url = Url::parse(&endpoint)
                .map_err(|_| "The download address is not valid.".to_string())?;

            // No automatic redirects: the bearer token goes to the accounts
            // host only, and the storage URL is fetched without it.
            let client = reqwest::Client::builder()
                .user_agent("lakeside-launcher")
                .timeout(Duration::from_secs(900))
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .map_err(|error| format!("Could not build the download client: {error}"))?;
            let first = client
                .get(endpoint_url.clone())
                .bearer_auth(token)
                .send()
                .await
                .map_err(|error| format!("Could not reach the Lakeside platform: {error}"))?;
            match first.status() {
                status if status.is_redirection() => {}
                reqwest::StatusCode::UNAUTHORIZED => {
                    return Err("Sign in to Lakeside to download this game.".to_string())
                }
                reqwest::StatusCode::FORBIDDEN | reqwest::StatusCode::NOT_FOUND => {
                    return Err("This account does not have a download for this game.".to_string())
                }
                status => return Err(format!("The Lakeside platform returned {status}.")),
            }
            let location = first
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| "The download redirect had no address.".to_string())?
                .to_string();
            let target =
                installer::resolve_redirect(&endpoint_url, &location, DOWNLOAD_HOSTS, validate_url)?;
            client
                .get(target)
                .send()
                .await
                .map_err(|error| format!("Could not download the game: {error}"))?
                .error_for_status()
                .map_err(|error| format!("Game download returned {error}"))?
        }
    };

    let total = response.content_length();
    if let Some(parent) = destination.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| format!("Could not create the download directory: {error}"))?;
    }
    let mut file = tokio::fs::File::create(destination)
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

    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn valid_sha256(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit())
}

/// Core installer, separated from the Tauri command so the Windows CI probe
/// exercises the same download, hash, install and path-check path. The sha256
/// from the signed manifest is mandatory and is checked before anything runs.
#[allow(clippy::too_many_arguments)]
pub async fn install_artifact<F>(
    install_root: PathBuf,
    product_id: &str,
    version: &str,
    source: DownloadSource,
    sha256: &str,
    file_name: &str,
    kind: &str,
    installed_version: Option<&str>,
    on_progress: F,
) -> Result<InstallResult, String>
where
    F: Fn(u64, Option<u64>) + Send,
{
    if !installer::valid_id(product_id) {
        return Err("Invalid product id.".to_string());
    }
    let parsed_kind = installer::InstallerKind::parse(kind).ok_or_else(|| {
        format!("Automatic installation does not support the {kind} package format yet.")
    })?;
    if !parsed_kind.supported_on(std::env::consts::OS) {
        return Err(format!(
            "Automatic installation of the {kind} package is not available on this system. Download the installer from the game's release page."
        ));
    }
    if !valid_sha256(sha256.trim()) {
        return Err("The signed release manifest has no checksum for this download.".to_string());
    }
    let safe_name = Path::new(file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty() && name.len() <= 200)
        .ok_or_else(|| "The release asset name is invalid.".to_string())?
        .to_string();

    // Resolve where this product lands before downloading anything.
    let executable: String = match parsed_kind {
        installer::InstallerKind::Nsis | installer::InstallerKind::Inno => {
            #[cfg(target_os = "windows")]
            {
                installed_executable(product_id)
                    .ok_or_else(|| {
                        "Automatic installation is not configured for this product.".to_string()
                    })?
                    .to_string()
            }
            #[cfg(not(target_os = "windows"))]
            {
                return Err("Windows installers can only run on Windows.".to_string());
            }
        }
        installer::InstallerKind::AppImage => installer::linux_appimage_relative(product_id)
            .ok_or_else(|| "Automatic installation is not configured for this product.".to_string())?
            .to_string(),
        installer::InstallerKind::Dmg => {
            return Err("Mac disk images are not installed automatically.".to_string())
        }
    };

    let directory = std::env::temp_dir().join("lakeside-launcher-downloads");
    let destination = directory.join(&safe_name);
    let actual = match download_to_file(&source, &destination, &on_progress).await {
        Ok(actual) => actual,
        Err(error) => {
            let _ = tokio::fs::remove_file(&destination).await;
            return Err(error);
        }
    };
    if !actual.eq_ignore_ascii_case(sha256.trim()) {
        let _ = tokio::fs::remove_file(&destination).await;
        return Err("Download did not match the signed release manifest.".to_string());
    }

    let action = installer::install_action(installed_version, version);

    let outcome: Result<(), String> = match parsed_kind {
        installer::InstallerKind::Nsis => {
            #[cfg(target_os = "windows")]
            {
                match std::process::Command::new(&destination).arg("/S").status() {
                    Ok(status) if status.success() => Ok(()),
                    Ok(_) => Err("The installer reported a failure.".to_string()),
                    Err(error) => Err(format!("Could not start the installer: {error}")),
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                Err("Windows installers can only run on Windows.".to_string())
            }
        }
        installer::InstallerKind::Inno => {
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                match installer::windows_inno_dir(&install_root, product_id)
                    .ok_or_else(|| "No install folder is configured for this product.".to_string())
                    .and_then(|dir| installer::inno_args(&dir))
                {
                    Ok(args) => {
                        let mut command = std::process::Command::new(&destination);
                        for argument in args {
                            command.raw_arg(argument);
                        }
                        match command.status() {
                            Ok(status) if status.success() => Ok(()),
                            Ok(_) => Err("The installer reported a failure.".to_string()),
                            Err(error) => Err(format!("Could not start the installer: {error}")),
                        }
                    }
                    Err(error) => Err(error),
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                Err("Windows installers can only run on Windows.".to_string())
            }
        }
        installer::InstallerKind::AppImage => {
            place_appimage(&destination, &install_root, product_id).await
        }
        installer::InstallerKind::Dmg => Err("Mac disk images are not installed automatically.".to_string()),
    };
    let _ = tokio::fs::remove_file(&destination).await;
    outcome?;

    safe_join(&install_root, &executable)
        .map_err(|_| "The installer finished but the game executable was not found.".to_string())?;

    Ok(InstallResult {
        version: version.to_string(),
        executable,
        action: match action {
            installer::InstallAction::Install => "install",
            installer::InstallAction::Update => "update",
            installer::InstallAction::Reinstall => "reinstall",
        }
        .to_string(),
    })
}

/// Copy a verified AppImage into the per-user data directory, mark it
/// executable and swap it into place. Only this one file is replaced.
async fn place_appimage(
    verified: &Path,
    install_root: &Path,
    product_id: &str,
) -> Result<(), String> {
    let target = installer::linux_appimage_path(install_root, product_id)
        .ok_or_else(|| "No install location is configured for this product.".to_string())?;
    let parent = target
        .parent()
        .ok_or_else(|| "The install location has no folder.".to_string())?;
    tokio::fs::create_dir_all(parent)
        .await
        .map_err(|error| format!("Could not create the install folder: {error}"))?;
    let staging = target.with_extension("AppImage.part");
    tokio::fs::copy(verified, &staging)
        .await
        .map_err(|error| format!("Could not place the game: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        tokio::fs::set_permissions(&staging, std::fs::Permissions::from_mode(0o755))
            .await
            .map_err(|error| format!("Could not make the game executable: {error}"))?;
    }
    tokio::fs::rename(&staging, &target)
        .await
        .map_err(|error| format!("Could not finish placing the game: {error}"))
}

/// Installed version from the launcher's own record, falling back to the
/// Windows uninstall registry for products installed outside the launcher.
fn detect_installed_version(app: &AppHandle, product_id: &str) -> Option<String> {
    let root = install_root(app);
    let state = read_install_state(app);
    let recorded = state
        .get(product_id)
        .filter(|entry| safe_join(&root, &entry.executable).is_ok())
        .map(|entry| entry.version.clone());

    #[cfg(target_os = "windows")]
    {
        if installer::inno_app_id(product_id).is_some() {
            // An Inno setup run by hand updates the registry, not installs.json.
            if let Some(version) = windows_inno_installed_version(product_id) {
                return Some(version);
            }
        } else if recorded.is_none() && product_id == "ahd" {
            return windows_installed_version("AHDClient");
        }
    }
    recorded
}

#[tauri::command]
fn installed_products(app: AppHandle) -> HashMap<String, InstalledProduct> {
    let root = install_root(&app);
    let mut state = read_install_state(&app);
    state.retain(|_, entry| safe_join(&root, &entry.executable).is_ok());

    #[cfg(target_os = "windows")]
    {
        for product_id in ["ahd", "corporate-warfare"] {
            let Some(executable) = installed_executable(product_id) else {
                continue;
            };
            if safe_join(&root, executable).is_err() {
                continue;
            }
            if state.contains_key(product_id) && installer::inno_app_id(product_id).is_none() {
                continue;
            }
            if let Some(version) = detect_installed_version(&app, product_id) {
                let installed_at = state.get(product_id).map(|entry| entry.installed_at).unwrap_or(0);
                state.insert(
                    product_id.to_string(),
                    InstalledProduct {
                        version,
                        executable: executable.to_string(),
                        installed_at,
                    },
                );
            }
        }
    }

    state
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn install_release(
    app: AppHandle,
    product_id: String,
    version: String,
    url: String,
    sha256: String,
    file_name: String,
    kind: String,
    commercial_id: Option<String>,
) -> Result<InstallResult, String> {
    let source = match commercial_id {
        Some(commercial_id) => {
            let stored = read_session(&app)?
                .ok_or_else(|| "Sign in to Lakeside to download this game.".to_string())?;
            DownloadSource::Account {
                base: platform_base(),
                commercial_id,
                token: stored.token,
            }
        }
        None => DownloadSource::Url(url),
    };
    let installed_version = detect_installed_version(&app, &product_id);

    let progress_app = app.clone();
    let progress_product = product_id.clone();
    let result = install_artifact(
        install_root(&app),
        &product_id,
        &version,
        source,
        &sha256,
        &file_name,
        &kind,
        installed_version.as_deref(),
        move |downloaded, total| {
            let _ = progress_app.emit(
                "install-progress",
                InstallProgress {
                    product_id: progress_product.clone(),
                    downloaded,
                    total,
                },
            );
        },
    )
    .await?;

    let _ = record_install(&app, &product_id, &result.version, &result.executable);
    Ok(result)
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
        .post(format!("{}/account/launcher/session", platform_base()))
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
        .get(format!("{}/account/launcher/entitlements", platform_base()))
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
    let headless_update = std::env::args().any(|argument| argument == "--headless-update");

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    if headless_update {
        builder = builder.setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_updater::UpdaterExt;

                let outcome = async {
                    let updater = handle.updater()?;
                    match updater.check().await? {
                        Some(update) => {
                            println!("update-available {}", update.version);
                            update
                                .download_and_install(
                                    |chunk, total| match total {
                                        Some(total) => println!("update-progress {chunk}/{total}"),
                                        None => println!("update-progress {chunk}"),
                                    },
                                    || println!("update-download-finished"),
                                )
                                .await?;
                            println!("update-installed {}", update.version);
                        }
                        None => println!("update-none"),
                    }
                    Ok::<(), Box<dyn std::error::Error>>(())
                }
                .await;

                if let Err(error) = outcome {
                    eprintln!("update-error {error}");
                }
                handle.exit(0);
            });
            Ok(())
        });
    }

    builder
        .invoke_handler(tauri::generate_handler![
            launch_product,
            detect_desktop_app,
            launch_desktop_app,
            open_web_game,
            open_external,
            begin_sign_in,
            get_release_manifest,
            is_installed,
            install_release,
            installed_products,
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

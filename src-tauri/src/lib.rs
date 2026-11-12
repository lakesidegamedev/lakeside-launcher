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
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use url::Url;

/// Hosts the launcher may open in a system browser (sign-in, checkout, docs).
const EXTERNAL_HOSTS: &[&str] = &["lakesidegames.net", "ahousedividedgame.com"];

/// Hosts a game may load inside a launcher-managed webview.
const GAME_HOSTS: &[&str] = &["lakesidegames.net", "ahousedividedgame.com"];

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
/// caller should hand to lakeside-auth. The one-time code is emitted as the
/// `sign-in-code` event after the `state` nonce matches.
#[tauri::command]
fn begin_sign_in(app: AppHandle) -> Result<SignInStart, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("Could not start the sign-in listener: {error}"))?;
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
#[tauri::command]
async fn get_release_manifest() -> Result<ReleaseManifest, String> {
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
            get_release_manifest
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
}

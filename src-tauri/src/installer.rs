// Pure install and launch logic, kept free of Tauri and the network so it can
// be unit tested on any host: installer kinds, silent arguments, per-product
// install paths, version comparison, download addressing and the game launch
// environment.

use std::cmp::Ordering;
use std::path::{Path, PathBuf};

use url::Url;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstallerKind {
    Nsis,
    Inno,
    AppImage,
    Dmg,
}

impl InstallerKind {
    pub fn parse(raw: &str) -> Option<Self> {
        match raw {
            "nsis" => Some(Self::Nsis),
            "inno" => Some(Self::Inno),
            "appimage" => Some(Self::AppImage),
            "dmg" => Some(Self::Dmg),
            _ => None,
        }
    }

    /// Whether this launcher build can run the kind on `os` (a
    /// `std::env::consts::OS` value). A Dmg is opened for the player, not installed.
    pub fn supported_on(self, os: &str) -> bool {
        match self {
            Self::Nsis | Self::Inno => os == "windows",
            Self::AppImage => os == "linux",
            Self::Dmg => os == "macos",
        }
    }
}

/// Silent Inno Setup arguments. The directory is passed as `/DIR="path"`;
/// callers on Windows must hand these to `raw_arg` so Inno sees the quotes.
pub fn inno_args(install_dir: &Path) -> Result<Vec<String>, String> {
    let dir = install_dir
        .to_str()
        .ok_or_else(|| "The install folder is not valid text.".to_string())?;
    if dir.is_empty() || dir.contains('"') || dir.contains('\n') || dir.contains('\r') {
        return Err("The install folder is not a valid path.".to_string());
    }
    Ok(vec![
        "/VERYSILENT".to_string(),
        "/SUPPRESSMSGBOXES".to_string(),
        "/NORESTART".to_string(),
        format!("/DIR=\"{dir}\""),
    ])
}

/// Inno Setup AppId (with braces) for products installed through Inno. The
/// uninstall registry key is `<AppId>_is1`.
pub fn inno_app_id(product_id: &str) -> Option<&'static str> {
    match product_id {
        "corporate-warfare" => Some("{7C1E9A52-4D3B-4F6A-8E21-3A9D5B0C6F47}"),
        _ => None,
    }
}

pub fn inno_uninstall_subkey(app_id: &str) -> String {
    format!(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{app_id}_is1")
}

/// Folder name for a product under the install root, and the executable name
/// inside it. Windows Inno installs mirror the Inno default for a per-user
/// install (`%LOCALAPPDATA%\Programs\<name>`), so a hand-run setup and the
/// launcher agree on one location.
pub fn windows_inno_dir(root: &Path, product_id: &str) -> Option<PathBuf> {
    match product_id {
        "corporate-warfare" => Some(root.join("Programs").join("Corporate Warfare")),
        _ => None,
    }
}

/// Catalog-relative executable for an Inno install, forward slashes.
pub fn windows_inno_executable(product_id: &str) -> Option<&'static str> {
    match product_id {
        "corporate-warfare" => Some("Programs/Corporate Warfare/Corporate Warfare.exe"),
        _ => None,
    }
}

/// AppImage destination under the per-user data root, and its catalog-relative
/// path. Only this one file is replaced; saves live elsewhere.
pub fn linux_appimage_relative(product_id: &str) -> Option<&'static str> {
    match product_id {
        "corporate-warfare" => Some("CorporateWarfare/CorporateWarfare.AppImage"),
        _ => None,
    }
}

pub fn linux_appimage_path(root: &Path, product_id: &str) -> Option<PathBuf> {
    linux_appimage_relative(product_id).map(|relative| root.join(relative))
}

/// Parse "1.9.0", "v1.9.0" or "1.9.0-preview.2" into three numeric parts.
fn parse_version(value: &str) -> [u64; 3] {
    let trimmed = value.trim().trim_start_matches(['v', 'V']);
    let head = trimmed.split(['-', '+']).next().unwrap_or("");
    let mut parts = [0u64; 3];
    for (slot, piece) in parts.iter_mut().zip(head.split('.')) {
        *slot = piece.trim().parse().unwrap_or(0);
    }
    parts
}

pub fn compare_versions(left: &str, right: &str) -> Ordering {
    parse_version(left).cmp(&parse_version(right))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstallAction {
    Install,
    Update,
    Reinstall,
}

/// Update only when the manifest is newer; Reinstall for the same or an older
/// manifest (the setup replaces files in place either way).
pub fn install_action(installed: Option<&str>, manifest: &str) -> InstallAction {
    match installed {
        None => InstallAction::Install,
        Some(current) if compare_versions(manifest, current) == Ordering::Greater => {
            InstallAction::Update
        }
        Some(_) => InstallAction::Reinstall,
    }
}

/// The platform key the accounts download endpoint expects.
pub fn download_platform(os: &str, arch: &str) -> Option<&'static str> {
    match (os, arch) {
        ("windows", "x86_64") => Some("windows-x86_64"),
        ("linux", "x86_64") => Some("linux-x86_64"),
        ("macos", _) => Some("macos-universal"),
        _ => None,
    }
}

pub fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
}

/// Platform keys such as `windows-x86_64`.
fn valid_platform_key(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 32
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-' || character == '_')
}

/// `GET <base>/account/launcher/download/<productId>/<platform>`.
pub fn account_download_url(
    base: &str,
    commercial_id: &str,
    platform: &str,
) -> Result<String, String> {
    if !valid_id(commercial_id) || !valid_platform_key(platform) {
        return Err("Invalid product or platform for the download.".to_string());
    }
    Ok(format!(
        "{}/account/launcher/download/{commercial_id}/{platform}",
        base.trim_end_matches('/')
    ))
}

/// Resolve and validate a redirect `Location` against the download allowlist
/// (https only, no credentials). Used so the session token is never sent to
/// the storage host.
pub fn resolve_redirect(
    base: &Url,
    location: &str,
    allowed: &[&str],
    validate: impl Fn(&str, &[&str]) -> Result<Url, String>,
) -> Result<Url, String> {
    let joined = base
        .join(location)
        .map_err(|_| "The download redirect was not a valid address.".to_string())?;
    validate(joined.as_str(), allowed)
}

/// Environment handed to a game that opted into the launcher handoff. The
/// handoff code is only present when the player is signed in.
pub fn launch_env(launcher_version: &str, handoff_code: Option<&str>) -> Vec<(String, String)> {
    let mut vars = vec![
        ("LAKESIDE_LAUNCHER".to_string(), "1".to_string()),
        (
            "LAKESIDE_LAUNCHER_VERSION".to_string(),
            launcher_version.to_string(),
        ),
    ];
    if let Some(code) = handoff_code.filter(|code| !code.is_empty()) {
        vars.push(("LAKESIDE_HANDOFF_CODE".to_string(), code.to_string()));
    }
    vars
}

/// Desktop apps the launcher detects from their own uninstall entry.
/// Publisher must be `DESKTOP_APP_PUBLISHER`.
#[allow(dead_code)]
pub const DESKTOP_APP_PUBLISHER: &str = "Lakeside Games";

pub fn desktop_app_display_name(product_id: &str) -> Option<&'static str> {
    match product_id {
        "margin-of-victory" => Some("Margin of Victory"),
        _ => None,
    }
}

/// Executable path from an uninstall `DisplayIcon` value such as
/// `"C:\Apps\Game\game.exe",0`.
#[allow(dead_code)]
pub fn exe_from_display_icon(value: &str) -> Option<String> {
    let mut text = value.trim();
    if let Some((head, tail)) = text.rsplit_once(',') {
        let digits = tail.trim().trim_start_matches('-');
        if !digits.is_empty() && digits.chars().all(|c| c.is_ascii_digit()) {
            text = head.trim();
        }
    }
    let text = text.trim_matches('"').trim();
    if text.to_ascii_lowercase().ends_with(".exe") {
        Some(text.to_string())
    } else {
        None
    }
}

/// One downloadable file from the accounts downloads API.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountFile {
    pub platform: String,
    pub name: String,
    pub size: Option<u64>,
    pub sha256: String,
    pub installer: String,
}

/// `GET /account/api/downloads/<product>` answer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountRelease {
    pub version: String,
    pub entitled: bool,
    pub files: Vec<AccountFile>,
}

/// Parse the downloads API body. Files without a valid platform key or a
/// 64 digit sha256 are dropped, so nothing unverifiable can be installed.
/// Returns None when there is no version or no usable file (not published).
pub fn parse_account_release(bytes: &[u8]) -> Option<AccountRelease> {
    let value: serde_json::Value = serde_json::from_slice(bytes).ok()?;
    let version = value.get("version")?.as_str()?.trim().to_string();
    if version.is_empty() || version.len() > 64 {
        return None;
    }
    let entitled = value
        .get("entitled")
        .and_then(|entitled| entitled.as_bool())
        .unwrap_or(false);
    let files: Vec<AccountFile> = value
        .get("files")?
        .as_array()?
        .iter()
        .filter_map(|file| {
            let platform = file.get("platform")?.as_str()?;
            let name = file.get("name")?.as_str()?;
            let sha256 = file.get("sha256")?.as_str()?.trim().to_ascii_lowercase();
            let installer = file.get("installer")?.as_str()?;
            if !valid_platform_key(platform)
                || sha256.len() != 64
                || !sha256.chars().all(|c| c.is_ascii_hexdigit())
            {
                return None;
            }
            Some(AccountFile {
                platform: platform.to_string(),
                name: name.to_string(),
                size: file.get("size").and_then(|size| size.as_u64()),
                sha256,
                installer: installer.to_string(),
            })
        })
        .collect();
    if files.is_empty() {
        return None;
    }
    Some(AccountRelease {
        version,
        entitled,
        files,
    })
}

/// The launcher's own release-artifact key for an accounts platform key.
pub fn manifest_key_for_platform(platform: &str) -> Option<&'static str> {
    match platform {
        "windows-x86_64" => Some("windows-x64"),
        "linux-x86_64" => Some("linux-x64"),
        "macos-universal" => Some("macos-arm64"),
        _ => None,
    }
}

/// `GET <base>/account/api/downloads/<productId>`.
pub fn account_release_url(base: &str, commercial_id: &str) -> Result<String, String> {
    if !valid_id(commercial_id) {
        return Err("Invalid product for the release lookup.".to_string());
    }
    Ok(format!(
        "{}/account/api/downloads/{commercial_id}",
        base.trim_end_matches('/')
    ))
}

/// Pull `code` out of the handoff response. Errors never echo the body.
pub fn parse_handoff_code(bytes: &[u8]) -> Option<String> {
    let value: serde_json::Value = serde_json::from_slice(bytes).ok()?;
    let code = value.get("code")?.as_str()?.trim();
    if code.is_empty() || code.len() > 512 {
        return None;
    }
    Some(code.to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    fn parses_display_icon_paths() {
        assert_eq!(
            super::exe_from_display_icon("\"C:\\Apps\\Game\\game.exe\",0"),
            Some("C:\\Apps\\Game\\game.exe".to_string())
        );
        assert_eq!(
            super::exe_from_display_icon("C:\\Apps\\Game\\game.exe"),
            Some("C:\\Apps\\Game\\game.exe".to_string())
        );
        assert_eq!(super::exe_from_display_icon("C:\\Apps\\Game\\game.ico"), None);
        assert_eq!(
            super::desktop_app_display_name("margin-of-victory"),
            Some("Margin of Victory")
        );
        assert_eq!(super::desktop_app_display_name("ahd"), None);
    }

    use super::*;

    #[test]
    fn parses_the_downloads_api_and_drops_unverifiable_files() {
        let body = br#"{"product":"corporate-warfare","version":"2.0.0","entitled":true,"files":[
            {"platform":"windows-x86_64","name":"CorporateWarfare-2.0.0-setup.exe","size":10,"sha256":"AB12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12","installer":"inno","url":"x"},
            {"platform":"linux-x86_64","name":"cw.AppImage","size":11,"sha256":"short","installer":"appimage"},
            {"platform":"../evil","name":"x","sha256":"ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12","installer":"inno"}]}"#;
        let parsed = parse_account_release(body).expect("release");
        assert_eq!(parsed.version, "2.0.0");
        assert!(parsed.entitled);
        assert_eq!(parsed.files.len(), 1);
        assert_eq!(parsed.files[0].installer, "inno");
        assert!(parsed.files[0].sha256.chars().all(|c| !c.is_ascii_uppercase()));
        assert!(parse_account_release(br#"{"version":"2.0.0","files":[]}"#).is_none());
        assert!(parse_account_release(b"not json").is_none());
        assert_eq!(manifest_key_for_platform("windows-x86_64"), Some("windows-x64"));
        assert_eq!(manifest_key_for_platform("beos"), None);
        assert_eq!(
            account_release_url("https://lakesidegames.net/", "corporate-warfare").as_deref(),
            Ok("https://lakesidegames.net/account/api/downloads/corporate-warfare")
        );
        assert!(account_release_url("https://lakesidegames.net", "../x").is_err());
    }

    #[test]
    fn parses_installer_kinds_and_platform_support() {
        assert_eq!(InstallerKind::parse("inno"), Some(InstallerKind::Inno));
        assert_eq!(InstallerKind::parse("msi"), None);
        assert!(InstallerKind::Inno.supported_on("windows"));
        assert!(!InstallerKind::Inno.supported_on("linux"));
        assert!(InstallerKind::AppImage.supported_on("linux"));
        assert!(!InstallerKind::AppImage.supported_on("windows"));
        assert!(InstallerKind::Nsis.supported_on("windows"));
        assert!(InstallerKind::Dmg.supported_on("macos"));
        assert!(!InstallerKind::Dmg.supported_on("linux"));
    }

    #[test]
    fn builds_silent_inno_arguments() {
        let args = inno_args(Path::new(r"C:\Users\p\AppData\Local\Programs\Corporate Warfare"))
            .expect("args");
        assert_eq!(args[0], "/VERYSILENT");
        assert_eq!(args[1], "/SUPPRESSMSGBOXES");
        assert_eq!(args[2], "/NORESTART");
        assert_eq!(
            args[3],
            "/DIR=\"C:\\Users\\p\\AppData\\Local\\Programs\\Corporate Warfare\""
        );
        assert!(inno_args(Path::new("C:\\a\"b")).is_err());
        assert!(inno_args(Path::new("")).is_err());
    }

    #[test]
    fn inno_registry_key_uses_the_app_id() {
        let id = inno_app_id("corporate-warfare").expect("id");
        assert_eq!(
            inno_uninstall_subkey(id),
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{7C1E9A52-4D3B-4F6A-8E21-3A9D5B0C6F47}_is1"
        );
        assert!(inno_app_id("ahd").is_none());
    }

    #[test]
    fn selects_per_product_install_paths() {
        let root = Path::new("/data");
        assert_eq!(
            windows_inno_dir(root, "corporate-warfare"),
            Some(root.join("Programs").join("Corporate Warfare"))
        );
        assert_eq!(windows_inno_dir(root, "ahd"), None);
        assert_eq!(
            linux_appimage_path(root, "corporate-warfare"),
            Some(root.join("CorporateWarfare/CorporateWarfare.AppImage"))
        );
        assert_eq!(linux_appimage_path(root, "ahd"), None);
        // The catalog-relative executable sits under the directory handed to Inno.
        assert_eq!(
            windows_inno_executable("corporate-warfare"),
            Some("Programs/Corporate Warfare/Corporate Warfare.exe")
        );
    }

    #[test]
    fn compares_versions() {
        assert_eq!(compare_versions("2.0.0", "1.9.0"), Ordering::Greater);
        assert_eq!(compare_versions("1.9.0", "1.9.0"), Ordering::Equal);
        assert_eq!(compare_versions("1.10.0", "1.9.9"), Ordering::Greater);
        assert_eq!(compare_versions("v1.9.0", "1.9.0"), Ordering::Equal);
        assert_eq!(compare_versions("2.0.0-preview.2", "2.0.0"), Ordering::Equal);
        assert_eq!(compare_versions("1.9", "1.9.1"), Ordering::Less);
    }

    #[test]
    fn picks_install_update_or_reinstall() {
        assert_eq!(install_action(None, "1.9.0"), InstallAction::Install);
        assert_eq!(install_action(Some("1.8.0"), "1.9.0"), InstallAction::Update);
        assert_eq!(install_action(Some("1.9.0"), "1.9.0"), InstallAction::Reinstall);
        assert_eq!(install_action(Some("2.0.0"), "1.9.0"), InstallAction::Reinstall);
    }

    #[test]
    fn maps_download_platforms_and_urls() {
        assert_eq!(download_platform("windows", "x86_64"), Some("windows-x86_64"));
        assert_eq!(download_platform("linux", "x86_64"), Some("linux-x86_64"));
        assert_eq!(download_platform("macos", "aarch64"), Some("macos-universal"));
        assert_eq!(download_platform("linux", "aarch64"), None);
        assert_eq!(
            account_download_url("https://lakesidegames.net/", "corporate-warfare", "windows-x86_64")
                .unwrap(),
            "https://lakesidegames.net/account/launcher/download/corporate-warfare/windows-x86_64"
        );
        assert!(account_download_url("https://x", "../etc", "linux-x86_64").is_err());
    }

    #[test]
    fn redirects_must_pass_the_allowlist() {
        let base = Url::parse("https://lakesidegames.net/account/launcher/download/a/b").unwrap();
        let allowed = ["r2.cloudflarestorage.com"];
        let check = |raw: &str, list: &[&str]| -> Result<Url, String> {
            let parsed = Url::parse(raw).map_err(|_| "bad".to_string())?;
            let host = parsed.host_str().unwrap_or("").to_string();
            if parsed.scheme() == "https" && list.iter().any(|allowed| host.ends_with(allowed)) {
                Ok(parsed)
            } else {
                Err("blocked".to_string())
            }
        };
        assert!(resolve_redirect(
            &base,
            "https://bucket.r2.cloudflarestorage.com/f?sig=1",
            &allowed,
            check
        )
        .is_ok());
        assert!(resolve_redirect(&base, "https://evil.test/f", &allowed, check).is_err());
        assert!(resolve_redirect(&base, "http://bucket.r2.cloudflarestorage.com/f", &allowed, check)
            .is_err());
    }

    #[test]
    fn builds_the_launch_environment() {
        let signed_out = launch_env("0.5.0", None);
        assert_eq!(
            signed_out,
            vec![
                ("LAKESIDE_LAUNCHER".to_string(), "1".to_string()),
                ("LAKESIDE_LAUNCHER_VERSION".to_string(), "0.5.0".to_string()),
            ]
        );
        let signed_in = launch_env("0.5.0", Some("abc"));
        assert_eq!(signed_in.len(), 3);
        assert_eq!(signed_in[2], ("LAKESIDE_HANDOFF_CODE".to_string(), "abc".to_string()));
        assert_eq!(launch_env("0.5.0", Some("")).len(), 2);
    }

    #[test]
    fn parses_the_handoff_code_without_leaking_bodies() {
        assert_eq!(parse_handoff_code(br#"{"code":" xyz "}"#), Some("xyz".to_string()));
        assert_eq!(parse_handoff_code(br#"{"code":""}"#), None);
        assert_eq!(parse_handoff_code(br#"{"nope":1}"#), None);
        assert_eq!(parse_handoff_code(b"not json"), None);
    }
}

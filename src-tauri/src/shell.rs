// Commands for managing installs and the Home screen: capabilities, install
// details, open folder, uninstall, the install folder setting, the home feed
// and last played. Path and parsing rules live in `manage` and `home` so they
// are unit tested; this file only touches the disk, the registry and the network.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::{home, installer, manage};

// ---------------------------------------------------------------- settings

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub install_root: Option<String>,
}

fn config_file(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join(name))
        .map_err(|error| format!("Could not resolve the app config directory: {error}"))
}

fn write_json_file(path: &Path, body: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create the settings folder: {error}"))?;
    }
    let temporary = path.with_extension("json.tmp");
    std::fs::write(&temporary, body).map_err(|error| format!("Could not write settings: {error}"))?;
    std::fs::rename(&temporary, path).map_err(|error| format!("Could not save settings: {error}"))
}

pub fn read_settings(app: &AppHandle) -> Settings {
    let Ok(path) = config_file(app, "settings.json") else {
        return Settings::default();
    };
    std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn write_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = config_file(app, "settings.json")?;
    let body = serde_json::to_vec(settings).map_err(|error| format!("Could not encode settings: {error}"))?;
    write_json_file(&path, body)
}

// ------------------------------------------------------------- last played

fn read_played(app: &AppHandle) -> HashMap<String, u64> {
    let Ok(path) = config_file(app, "played.json") else {
        return HashMap::new();
    };
    std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

/// Remember that a game was just started. Best effort: a failure never blocks a launch.
pub fn record_played(app: &AppHandle, product_id: &str) {
    if !manage::known_product(product_id) {
        return;
    }
    let mut played = read_played(app);
    played.insert(product_id.to_string(), crate::now_millis());
    if let (Ok(path), Ok(body)) = (config_file(app, "played.json"), serde_json::to_vec(&played)) {
        let _ = write_json_file(&path, body);
    }
}

// ------------------------------------------------------------ capabilities

/// What this build of the shell can do on this system. The webview greys out
/// anything not listed. macOS installs are disk images the player drags into
/// Applications, so the management commands are not offered there.
#[tauri::command]
pub fn launcher_capabilities() -> Vec<String> {
    let mut list: Vec<&str> = Vec::new();
    if std::env::consts::OS == "windows" || std::env::consts::OS == "linux" {
        list.extend(["install_details", "open_install_folder", "uninstall_product", "set_install_root"]);
    }
    list.into_iter().map(str::to_string).collect()
}

// --------------------------------------------------------------- locations

/// Where a product's files are: the folder the launcher placed it in, or the
/// location a Windows app registered for itself.
fn location_for(app: &AppHandle, product_id: &str) -> Result<PathBuf, String> {
    if !manage::known_product(product_id) {
        return Err("Unknown product.".to_string());
    }
    let root = crate::install_root(app);
    match manage::product_dir(&root, product_id, std::env::consts::OS) {
        Ok(dir) => Ok(dir),
        Err(placed_error) => {
            if let Some(found) = crate::find_desktop_app(product_id) {
                let location = PathBuf::from(&found.install_location);
                if location.is_dir() {
                    return Ok(location);
                }
            }
            Err(placed_error)
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallDetails {
    pub location: String,
    pub size_bytes: Option<u64>,
    pub last_played_at: Option<u64>,
    pub free_space_bytes: Option<u64>,
}

#[cfg(windows)]
fn free_space(path: &Path) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;
    extern "system" {
        fn GetDiskFreeSpaceExW(
            directory: *const u16,
            available_to_caller: *mut u64,
            total: *mut u64,
            total_free: *mut u64,
        ) -> i32;
    }
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    let (mut available, mut total, mut free) = (0u64, 0u64, 0u64);
    // SAFETY: `wide` is a NUL terminated UTF-16 string that outlives the call,
    // and the three out pointers are valid for the duration of the call.
    let ok = unsafe { GetDiskFreeSpaceExW(wide.as_ptr(), &mut available, &mut total, &mut free) };
    (ok != 0).then_some(available)
}

#[cfg(not(windows))]
fn free_space(path: &Path) -> Option<u64> {
    let output = std::process::Command::new("df").arg("-Pk").arg(path).output().ok()?;
    if !output.status.success() {
        return None;
    }
    manage::parse_df_available(&String::from_utf8_lossy(&output.stdout))
}

/// Location, size on disk, last played and free space for an installed game.
#[tauri::command]
pub async fn install_details(app: AppHandle, product_id: String) -> Result<InstallDetails, String> {
    let location = location_for(&app, &product_id)?;
    let last_played_at = read_played(&app).get(&product_id).copied();
    let measured = location.clone();
    let (size, free) = tauri::async_runtime::spawn_blocking(move || {
        (manage::dir_size(&measured, 200_000), free_space(&measured))
    })
    .await
    .map_err(|error| format!("Could not measure the install: {error}"))?;
    Ok(InstallDetails {
        location: location.to_string_lossy().to_string(),
        size_bytes: Some(size),
        last_played_at,
        free_space_bytes: free,
    })
}

fn open_in_file_manager(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut command = std::process::Command::new("explorer");
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let mut command = std::process::Command::new("xdg-open");
    command.arg(path);
    #[cfg(target_os = "linux")]
    crate::scrub_appimage_env(&mut command);
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open the folder: {error}"))
}

/// Open a game's folder, or the install folder when no product is given.
#[tauri::command]
pub fn open_install_folder(app: AppHandle, product_id: Option<String>) -> Result<(), String> {
    let folder = match product_id {
        Some(id) => location_for(&app, &id)?,
        None => {
            let root = crate::install_root(&app);
            if !root.is_dir() {
                return Err("Nothing is installed yet.".to_string());
            }
            root
        }
    };
    open_in_file_manager(&folder)
}

// ---------------------------------------------------------- install folder

#[tauri::command]
pub fn get_install_root(app: AppHandle) -> String {
    crate::install_root(&app).to_string_lossy().to_string()
}

/// Use a new install folder for new installs, or the default when `path` is
/// None. Refused while games are installed, because their saved locations are
/// relative to the folder and would no longer be found.
#[tauri::command]
pub fn set_install_root(app: AppHandle, path: Option<String>) -> Result<String, String> {
    let mut settings = read_settings(&app);
    match path {
        None => settings.install_root = None,
        Some(raw) => {
            let chosen = manage::validate_install_root(&raw)?;
            if !crate::installed_products(app.clone()).is_empty() {
                return Err(
                    "Uninstall your installed games first. They would not be found in a new folder."
                        .to_string(),
                );
            }
            std::fs::create_dir_all(&chosen)
                .map_err(|error| format!("Could not create that folder: {error}"))?;
            if !chosen.is_dir() {
                return Err("That is not a folder.".to_string());
            }
            let probe = chosen.join(".lakeside-write-test");
            std::fs::write(&probe, b"ok").map_err(|_| "The launcher cannot write to that folder.".to_string())?;
            let _ = std::fs::remove_file(&probe);
            settings.install_root = Some(raw.trim().to_string());
        }
    }
    write_settings(&app, &settings)?;
    Ok(get_install_root(app))
}

// --------------------------------------------------------------- uninstall

#[cfg(target_os = "windows")]
struct UninstallEntry {
    uninstall_string: String,
    install_location: String,
}

/// The product's own registered uninstall entry, if it has one.
#[cfg(target_os = "windows")]
fn windows_uninstall_entry(product_id: &str) -> Option<UninstallEntry> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    let read = |key: &RegKey| -> Option<UninstallEntry> {
        let uninstall_string: String = key.get_value("UninstallString").ok()?;
        let install_location: String = key.get_value("InstallLocation").unwrap_or_default();
        Some(UninstallEntry {
            uninstall_string,
            install_location: install_location.trim().trim_matches('"').to_string(),
        })
    };
    let base = r"Software\Microsoft\Windows\CurrentVersion\Uninstall";

    if let Some(app_id) = installer::inno_app_id(product_id) {
        let subkey = installer::inno_uninstall_subkey(app_id);
        for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
            if let Ok(key) = RegKey::predef(hive).open_subkey_with_flags(&subkey, KEY_READ) {
                if let Some(entry) = read(&key) {
                    return Some(entry);
                }
            }
        }
        return None;
    }

    // Everything else is found by its display name (and publisher for the
    // Lakeside desktop apps), in the same hives the launcher already reads.
    let (display_name, publisher): (&str, Option<&str>) = match product_id {
        "ahd" => ("AHDClient", None),
        other => (
            installer::desktop_app_display_name(other)?,
            Some(installer::DESKTOP_APP_PUBLISHER),
        ),
    };
    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        let Ok(uninstall) = RegKey::predef(hive).open_subkey_with_flags(base, KEY_READ) else {
            continue;
        };
        for name in uninstall.enum_keys().flatten() {
            let Ok(key) = uninstall.open_subkey_with_flags(&name, KEY_READ) else {
                continue;
            };
            let display: String = key.get_value("DisplayName").unwrap_or_default();
            if display.trim() != display_name {
                continue;
            }
            if let Some(expected) = publisher {
                let found: String = key.get_value("Publisher").unwrap_or_default();
                if found.trim() != expected {
                    continue;
                }
            }
            if let Some(entry) = read(&key) {
                return Some(entry);
            }
        }
    }
    None
}

/// Remove a game. Windows games run their own uninstaller (found in the
/// registry and only run when it sits inside the install folder or the
/// location the app registered). Linux games, and Windows games with no
/// uninstaller, lose only the launcher's own folder for that product. Saves
/// live elsewhere and are never touched.
#[tauri::command]
pub async fn uninstall_product(app: AppHandle, product_id: String) -> Result<(), String> {
    if !manage::known_product(&product_id) {
        return Err("Unknown product.".to_string());
    }
    let os = std::env::consts::OS;
    if os != "windows" && os != "linux" {
        return Err("Uninstalling from the launcher is not available on this system.".to_string());
    }
    let root = crate::install_root(&app);

    #[cfg(target_os = "windows")]
    {
        if let Some(entry) = windows_uninstall_entry(&product_id) {
            let (program, _registry_args) = manage::parse_uninstall_string(&entry.uninstall_string)
                .ok_or_else(|| "The uninstaller entry could not be read.".to_string())?;
            let mut allowed = vec![root.clone()];
            if !entry.install_location.is_empty() {
                allowed.push(PathBuf::from(&entry.install_location));
            }
            if !manage::uninstaller_allowed(&program, &allowed) {
                return Err(
                    "The uninstaller is not where the launcher expects it, so it was not run.".to_string(),
                );
            }
            let args = manage::silent_uninstall_args(&program)
                .ok_or_else(|| "That uninstaller is not one the launcher can run quietly.".to_string())?;
            let status = tauri::async_runtime::spawn_blocking(move || {
                std::process::Command::new(&program).args(&args).status()
            })
            .await
            .map_err(|error| format!("The uninstaller did not finish: {error}"))?
            .map_err(|error| format!("Could not start the uninstaller: {error}"))?;
            if !status.success() {
                return Err("The uninstaller reported a failure.".to_string());
            }
            crate::forget_install(&app, &product_id)?;
            return Ok(());
        }
    }

    // No registered uninstaller: remove only this product's own folder.
    let dir = manage::product_dir(&root, &product_id, os)?;
    if os == "linux" {
        // A launcher-placed AppImage is one file in its own folder.
        if let Some(file) = installer::linux_appimage_path(&root, &product_id) {
            match std::fs::remove_file(&file) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(format!("Could not remove the game: {error}")),
            }
        }
        // Remove the folder only if nothing else is in it.
        let _ = std::fs::remove_dir(&dir);
    } else {
        std::fs::remove_dir_all(&dir).map_err(|error| format!("Could not remove the game: {error}"))?;
    }
    crate::forget_install(&app, &product_id)?;
    Ok(())
}

// ------------------------------------------------------- home and switches

/// The Home slides: fetched here (the site sends no CORS header), validated,
/// and returned only when the shape is right.
#[tauri::command]
pub async fn fetch_home_feed() -> Result<home::HomeFeed, String> {
    if !home::feed_url_allowed(home::HOME_FEED_URL) {
        return Err("The home feed address is not allowed.".to_string());
    }
    let client = reqwest::Client::builder()
        .user_agent("lakeside-launcher")
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| format!("Could not build the feed client: {error}"))?;
    let response = client
        .get(home::HOME_FEED_URL)
        .send()
        .await
        .map_err(|error| format!("Could not reach the home feed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("The home feed returned {}", response.status()));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Could not read the home feed: {error}"))?;
    home::parse_feed(&bytes)
}

/// Whether the studio free-access switch is on. The entitlements service reads
/// the same switch, so this agrees with what a signed-in player is granted.
#[tauri::command]
pub async fn free_access_status() -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .user_agent("lakeside-launcher")
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| format!("Could not build the client: {error}"))?;
    let response = client
        .get("https://lakesidegames.net/account/api/free-access")
        .send()
        .await
        .map_err(|error| format!("Could not reach the site: {error}"))?;
    if !response.status().is_success() {
        return Ok(false);
    }
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|error| format!("The free access answer was malformed: {error}"))?;
    Ok(body.get("on").and_then(serde_json::Value::as_bool).unwrap_or(false))
}

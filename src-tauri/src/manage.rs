// Managing installed games: where they live, how big they are, how to remove
// them, and where the install folder may be. Pure path and parsing rules, no
// Tauri and no network, so they are unit tested on any host. Nothing here reads
// or deletes saves: saves live outside every folder this module can name.

use std::path::{Component, Path, PathBuf};

/// Products the launcher knows how to manage. Every command checks this first.
pub const PRODUCT_IDS: &[&str] = &[
    "ahd",
    "corporate-warfare",
    "urban-sprawl",
    "margin-of-victory",
    "grand-century-desktop",
];

pub fn known_product(product_id: &str) -> bool {
    PRODUCT_IDS.contains(&product_id)
}

/// The folder a product owns under the install root, forward slashes, for an
/// `std::env::consts::OS` value. None when the product is not placed by the
/// launcher on that system (apps found through their own uninstall entry).
pub fn product_dir_relative(product_id: &str, os: &str) -> Option<&'static str> {
    match (os, product_id) {
        ("windows", "ahd") => Some("AHDClient"),
        ("windows", "corporate-warfare") => Some("Programs/Corporate Warfare"),
        ("windows", "urban-sprawl") => Some("Programs/Urban Sprawl"),
        ("windows", "grand-century-desktop") => Some("GrandCentury"),
        ("linux", "corporate-warfare") => Some("CorporateWarfare"),
        ("linux", "urban-sprawl") => Some("UrbanSprawl"),
        ("linux", "grand-century-desktop") => Some("GrandCentury"),
        _ => None,
    }
}

fn has_only_normal_parts(path: &Path) -> bool {
    path.components().all(|component| matches!(component, Component::Normal(_)))
}

/// `root/<product folder>`, after checking that it exists and really sits
/// strictly inside the root (symlinks resolved). The root itself is refused.
pub fn product_dir(root: &Path, product_id: &str, os: &str) -> Result<PathBuf, String> {
    if !known_product(product_id) {
        return Err("Unknown product.".to_string());
    }
    let relative = product_dir_relative(product_id, os)
        .ok_or_else(|| "This game is not installed by the launcher on this system.".to_string())?;
    let relative_path = Path::new(relative);
    if !has_only_normal_parts(relative_path) {
        return Err("The product folder is not a plain relative path.".to_string());
    }
    let canonical_root = root
        .canonicalize()
        .map_err(|_| "The install folder does not exist yet.".to_string())?;
    let canonical = canonical_root
        .join(relative_path)
        .canonicalize()
        .map_err(|_| "That game is not installed yet.".to_string())?;
    strictly_inside(&canonical_root, &canonical)?;
    Ok(canonical)
}

/// `path` must be below `root` and not equal to it. Both must already be canonical.
pub fn strictly_inside(root: &Path, path: &Path) -> Result<(), String> {
    if path == root || !path.starts_with(root) {
        return Err("That path is outside the install folder.".to_string());
    }
    Ok(())
}

const BLOCKED_UNIX: &[&str] = &[
    "/bin", "/boot", "/dev", "/etc", "/lib", "/lib64", "/proc", "/root", "/run", "/sbin", "/sys", "/usr",
    "/var", "/System", "/Library", "/Applications", "/private", "/Volumes",
];

const BLOCKED_WINDOWS: &[&str] = &["windows", "program files", "program files (x86)", "programdata"];

/// Check a folder the player typed for the install root. Syntax only; the
/// caller still has to create it and check it is writable.
pub fn validate_install_root(raw: &str) -> Result<PathBuf, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Enter a folder.".to_string());
    }
    if trimmed.chars().count() > 240 {
        return Err("That path is too long.".to_string());
    }
    if trimmed.contains('\0') || trimmed.contains('\n') || trimmed.contains('\r') || trimmed.contains('"') {
        return Err("That path has characters a folder cannot use.".to_string());
    }
    // Judged as text so the rules are the same on every host.
    let normalized = trimmed.replace('\\', "/");
    let windows = is_windows_absolute(trimmed);
    if !windows && !normalized.starts_with('/') {
        return Err("Use a full path, such as D:\\Games or /home/you/games.".to_string());
    }
    let mut parts: Vec<&str> = normalized.split('/').filter(|part| !part.is_empty()).collect();
    if windows {
        parts.remove(0); // the drive letter
    }
    if parts.iter().any(|part| *part == ".." || *part == ".") {
        return Err("The folder path may not contain . or .. parts.".to_string());
    }
    if parts.is_empty() {
        return Err("Pick a folder, not a whole drive.".to_string());
    }
    let path = PathBuf::from(trimmed);
    let lower = trimmed.replace('\\', "/").to_lowercase();
    for blocked in BLOCKED_UNIX {
        let blocked_lower = blocked.to_lowercase();
        if lower == blocked_lower || lower.starts_with(&format!("{blocked_lower}/")) {
            return Err("That is a system folder. Pick one of your own.".to_string());
        }
    }
    // Windows drive paths: C:/Windows, C:/Program Files, and so on.
    let without_drive = lower.split_once(":/").map(|(_, rest)| rest).unwrap_or("");
    let first = without_drive.split('/').next().unwrap_or("");
    if is_windows_absolute(trimmed) && BLOCKED_WINDOWS.contains(&first) {
        return Err("That is a system folder. Pick one of your own.".to_string());
    }
    Ok(path)
}

/// "C:\Games" or "C:/Games", checked as text so the rule is the same on every host.
fn is_windows_absolute(raw: &str) -> bool {
    let bytes = raw.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
}

/// Total size of the files under `dir`, without following links. Stops counting
/// after `max_entries` so a huge or hostile tree cannot stall the launcher.
pub fn dir_size(dir: &Path, max_entries: usize) -> u64 {
    let mut total = 0u64;
    let mut seen = 0usize;
    let mut stack = vec![dir.to_path_buf()];
    while let Some(current) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&current) else {
            continue;
        };
        for entry in entries.flatten() {
            seen += 1;
            if seen > max_entries {
                return total;
            }
            let Ok(meta) = std::fs::symlink_metadata(entry.path()) else {
                continue;
            };
            if meta.file_type().is_symlink() {
                continue;
            }
            if meta.is_dir() {
                stack.push(entry.path());
            } else {
                total = total.saturating_add(meta.len());
            }
        }
    }
    total
}

/// Free bytes from `df -Pk <path>` output: last line, fourth column, in KiB.
pub fn parse_df_available(output: &str) -> Option<u64> {
    let line = output.lines().rev().find(|line| !line.trim().is_empty())?;
    let kib: u64 = line.split_whitespace().nth(3)?.parse().ok()?;
    kib.checked_mul(1024)
}

/// A registry UninstallString such as `"C:\Games\App\unins000.exe" /SILENT`
/// into the program and its own arguments. Unquoted values are taken whole.
pub fn parse_uninstall_string(raw: &str) -> Option<(PathBuf, Vec<String>)> {
    let value = raw.trim();
    if value.is_empty() {
        return None;
    }
    if let Some(rest) = value.strip_prefix('"') {
        let (program, tail) = rest.split_once('"')?;
        let args = tail.split_whitespace().map(str::to_string).collect();
        return Some((PathBuf::from(program), args));
    }
    // Unquoted: everything up to ".exe" is the program.
    let lower = value.to_lowercase();
    let end = lower.find(".exe")? + 4;
    let program = &value[..end];
    let args = value[end..].split_whitespace().map(str::to_string).collect();
    Some((PathBuf::from(program), args))
}

/// Silent arguments for the uninstaller kinds the launcher knows, chosen by the
/// uninstaller's own file name. Registry-supplied arguments are never reused.
pub fn silent_uninstall_args(program: &Path) -> Option<Vec<String>> {
    let name = program.file_name()?.to_str()?.to_lowercase();
    let inno_serial = name
        .strip_prefix("unins")
        .and_then(|rest| rest.strip_suffix(".exe"))
        .map(|digits| !digits.is_empty() && digits.chars().all(|c| c.is_ascii_digit()))
        .unwrap_or(false);
    if inno_serial {
        // Inno Setup: unins000.exe, unins001.exe, ...
        return Some(vec![
            "/VERYSILENT".to_string(),
            "/SUPPRESSMSGBOXES".to_string(),
            "/NORESTART".to_string(),
        ]);
    }
    if name == "uninstall.exe" || name == "uninstall.com" {
        // NSIS (the Tauri bundler).
        return Some(vec!["/S".to_string()]);
    }
    None
}

/// An uninstaller may run only when it is a real, absolute, recognised
/// uninstaller that sits inside one of the folders its own install is allowed
/// to occupy (the install root, or the location the app registered).
pub fn uninstaller_allowed(program: &Path, allowed_dirs: &[PathBuf]) -> bool {
    if !program.is_absolute() || silent_uninstall_args(program).is_none() {
        return false;
    }
    let Ok(canonical) = program.canonicalize() else {
        return false;
    };
    if !canonical.is_file() {
        return false;
    }
    allowed_dirs.iter().any(|dir| {
        dir.canonicalize()
            .map(|dir| canonical.starts_with(&dir) && canonical != dir)
            .unwrap_or(false)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("lakeside-manage-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn only_catalog_products_are_known() {
        assert!(known_product("corporate-warfare"));
        assert!(known_product("urban-sprawl"));
        assert_eq!(product_dir_relative("urban-sprawl", "windows"), Some("Programs/Urban Sprawl"));
        assert_eq!(product_dir_relative("urban-sprawl", "linux"), Some("UrbanSprawl"));
        assert!(!known_product("../etc"));
        assert!(!known_product(""));
        assert!(!known_product("electioneer"));
        assert!(known_product("grand-century-desktop"));
    }

    #[test]
    fn product_folders_are_per_system() {
        assert_eq!(product_dir_relative("corporate-warfare", "windows"), Some("Programs/Corporate Warfare"));
        assert_eq!(product_dir_relative("corporate-warfare", "linux"), Some("CorporateWarfare"));
        assert_eq!(product_dir_relative("grand-century-desktop", "windows"), Some("GrandCentury"));
        assert_eq!(product_dir_relative("ahd", "linux"), None);
        assert_eq!(product_dir_relative("margin-of-victory", "windows"), None);
        assert_eq!(product_dir_relative("corporate-warfare", "macos"), None);
    }

    #[test]
    fn product_dir_must_exist_and_stay_inside_the_root() {
        let root = scratch("root");
        assert!(product_dir(&root, "corporate-warfare", "linux").is_err());
        std::fs::create_dir_all(root.join("CorporateWarfare")).unwrap();
        let found = product_dir(&root, "corporate-warfare", "linux").unwrap();
        assert!(found.ends_with("CorporateWarfare"));
        assert!(product_dir(&root, "nope", "linux").is_err());
        assert!(product_dir(&root, "margin-of-victory", "linux").is_err());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[cfg(unix)]
    #[test]
    fn a_link_that_points_outside_the_root_is_refused() {
        let root = scratch("link-root");
        let outside = scratch("link-outside");
        std::os::unix::fs::symlink(&outside, root.join("CorporateWarfare")).unwrap();
        assert!(product_dir(&root, "corporate-warfare", "linux").is_err());
        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&outside);
    }

    #[test]
    fn the_root_itself_and_outside_paths_are_not_strictly_inside() {
        let root = scratch("inside");
        let canonical = root.canonicalize().unwrap();
        assert!(strictly_inside(&canonical, &canonical).is_err());
        assert!(strictly_inside(&canonical, canonical.parent().unwrap()).is_err());
        assert!(strictly_inside(&canonical, &canonical.join("a")).is_ok());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn install_root_rules() {
        assert!(validate_install_root("/home/player/games").is_ok());
        assert!(validate_install_root("D:\\Games").is_ok());
        assert!(validate_install_root("D:/Games/Lakeside").is_ok());
        for bad in [
            "",
            "   ",
            "games",
            "./games",
            "/home/player/../root",
            "/",
            "C:\\",
            "/etc",
            "/usr/local/games",
            "C:\\Windows\\Temp",
            "C:\\Program Files\\Games",
            "C:\\Program Files (x86)",
            "D:\\a\"b",
        ] {
            assert!(validate_install_root(bad).is_err(), "{bad}");
        }
        assert!(validate_install_root(&"a/".repeat(200)).is_err());
    }

    #[test]
    fn sums_file_sizes_without_following_links() {
        let dir = scratch("size");
        std::fs::write(dir.join("a.bin"), vec![0u8; 100]).unwrap();
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("sub").join("b.bin"), vec![0u8; 50]).unwrap();
        assert_eq!(dir_size(&dir, 1000), 150);
        assert!(dir_size(&dir, 1) <= 150);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn reads_free_space_from_df() {
        let out = "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/sda1 1000 400 600 40% /\n";
        assert_eq!(parse_df_available(out), Some(600 * 1024));
        assert_eq!(parse_df_available(""), None);
        assert_eq!(parse_df_available("junk"), None);
    }

    #[test]
    fn parses_uninstall_strings() {
        let (program, args) = parse_uninstall_string(r#""C:\Users\p\AppData\Local\Programs\Corporate Warfare\unins000.exe" /SILENT"#).unwrap();
        assert!(program.to_string_lossy().ends_with("unins000.exe"));
        assert_eq!(args, vec!["/SILENT".to_string()]);
        let (program, args) = parse_uninstall_string(r"C:\Apps\AHDClient\uninstall.exe").unwrap();
        assert!(program.to_string_lossy().ends_with("uninstall.exe"));
        assert!(args.is_empty());
        assert!(parse_uninstall_string("").is_none());
        assert!(parse_uninstall_string("msiexec /x {GUID}").is_none());
    }

    #[test]
    fn chooses_silent_arguments_by_uninstaller_name_only() {
        assert_eq!(
            silent_uninstall_args(Path::new("/x/unins000.exe")).unwrap().first().map(String::as_str),
            Some("/VERYSILENT")
        );
        assert_eq!(silent_uninstall_args(Path::new("/x/uninstall.exe")), Some(vec!["/S".to_string()]));
        assert!(silent_uninstall_args(Path::new("/x/cmd.exe")).is_none());
        assert!(silent_uninstall_args(Path::new("/x/evil-unins.exe")).is_none());
        assert!(silent_uninstall_args(Path::new("/x/unins.exe")).is_none());
        assert!(silent_uninstall_args(Path::new("/x/unins000x.exe")).is_none());
    }

    #[test]
    fn an_uninstaller_must_sit_inside_an_allowed_folder() {
        let allowed = scratch("unins-allowed");
        let other = scratch("unins-other");
        let inside = allowed.join("unins000.exe");
        let outside = other.join("unins000.exe");
        std::fs::write(&inside, b"x").unwrap();
        std::fs::write(&outside, b"x").unwrap();
        let dirs = vec![allowed.clone()];
        assert!(uninstaller_allowed(&inside, &dirs));
        assert!(!uninstaller_allowed(&outside, &dirs));
        assert!(!uninstaller_allowed(&allowed.join("missing-unins.exe"), &dirs));
        assert!(!uninstaller_allowed(Path::new("unins000.exe"), &dirs));
        let _ = std::fs::remove_dir_all(&allowed);
        let _ = std::fs::remove_dir_all(&other);
    }
}

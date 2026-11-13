// End-to-end check of a real game install through the same code the launcher
// uses (download, checksum, placement, handoff, start). Runs on Linux under a
// virtual display; the Windows job drives the real launcher window instead.
//
//   PRODUCT=corporate-warfare LAKESIDE_BEARER=... game_install_probe
//   PRODUCT=grand-century-desktop game_install_probe
//
// corporate-warfare goes through GET /account/api/downloads/<product> and
// /account/launcher/download/<product>/<platform> with the bearer, then asks
// for a handoff code and starts the game with it. grand-century-desktop comes
// from the signed manifest. The install root is LAKESIDE_INSTALL_ROOT.
// Nothing secret is printed.

#[cfg(not(unix))]
fn main() {
    eprintln!("game_install_probe is the Linux check");
    std::process::exit(2);
}

#[cfg(unix)]
fn alive(pid: u32) -> bool {
    match std::fs::read_to_string(format!("/proc/{pid}/stat")) {
        Ok(stat) => stat
            .rsplit(')')
            .next()
            .and_then(|tail| tail.trim().chars().next())
            .map(|state| state != 'Z' && state != 'X')
            .unwrap_or(false),
        Err(_) => false,
    }
}

#[cfg(unix)]
fn main() {
    use lakeside_launcher_lib as lib;
    use std::path::PathBuf;
    use std::time::{Duration, Instant};

    let product = std::env::var("PRODUCT").expect("PRODUCT");
    let root = PathBuf::from(std::env::var("LAKESIDE_INSTALL_ROOT").expect("LAKESIDE_INSTALL_ROOT"));
    std::fs::create_dir_all(&root).expect("install root");
    let base = std::env::var("LAKESIDE_PLATFORM_API").unwrap_or_else(|_| "https://lakesidegames.net".to_string());
    let os = std::env::consts::OS;
    let platform = lib::download_platform(os, std::env::consts::ARCH).expect("a supported platform");

    let (version, source, sha256, name, kind, client): (String, lib::DownloadSource, String, String, String, Option<&str>) =
        if product == "corporate-warfare" {
            let token = std::env::var("LAKESIDE_BEARER").expect("LAKESIDE_BEARER");
            let url = lib::account_release_url(&base, &product).expect("release url");
            let body = tauri::async_runtime::block_on(async {
                reqwest::Client::new()
                    .get(&url)
                    .bearer_auth(&token)
                    .send()
                    .await
                    .expect("release request")
                    .bytes()
                    .await
                    .expect("release body")
            });
            // Print every platform the answer lists, known or not.
            let raw: serde_json::Value = serde_json::from_slice(&body).expect("release json");
            println!("entitled: {}", raw.get("entitled").map(|v| v.to_string()).unwrap_or_default());
            for file in raw.get("files").and_then(|f| f.as_array()).into_iter().flatten() {
                println!(
                    "listed: platform={} installer={} name={}",
                    file.get("platform").and_then(|v| v.as_str()).unwrap_or("?"),
                    file.get("installer").map(|v| v.to_string()).unwrap_or_default(),
                    file.get("name").and_then(|v| v.as_str()).unwrap_or("?"),
                );
            }
            let release = lib::parse_account_release(&body).expect("a usable release for this account");
            assert!(release.entitled, "the account is not entitled to {product}");
            let file = release
                .files
                .iter()
                .find(|file| file.platform == platform)
                .expect("a file for this platform");
            (
                release.version.clone(),
                lib::DownloadSource::Account {
                    base: base.clone(),
                    commercial_id: product.clone(),
                    token,
                    platform: platform.to_string(),
                },
                file.sha256.clone(),
                file.name.clone(),
                file.installer.clone(),
                Some("corporate-warfare-desktop"),
            )
        } else {
            let manifest = tauri::async_runtime::block_on(lib::load_release_manifest()).expect("signed manifest");
            let entry = manifest.products.get(&product).expect("product in the manifest");
            let artifact = entry.artifacts.get("linux-x64").expect("linux-x64 artifact");
            (
                entry.version.clone(),
                lib::DownloadSource::Url(artifact.url.clone()),
                artifact.sha256.clone().unwrap_or_default(),
                artifact.name.clone(),
                artifact.kind.clone(),
                None,
            )
        };

    println!("installing {product} {version} ({kind}) for {os}");
    let result = tauri::async_runtime::block_on(lib::install_artifact(
        root.clone(),
        &product,
        &version,
        source,
        &sha256,
        &name,
        &kind,
        None,
        |_downloaded, _total| {},
    ))
    .expect("install should complete");
    let binary = root.join(&result.executable);
    assert!(binary.is_file(), "installer finished but {} is missing", binary.display());
    println!("installed {} at {}", result.version, binary.display());

    let handoff = match client {
        Some(client_id) => {
            let token = std::env::var("LAKESIDE_BEARER").expect("LAKESIDE_BEARER");
            let code = tauri::async_runtime::block_on(lib::handoff_code_for(&token, client_id));
            assert!(code.is_some(), "the handoff request did not return a code");
            println!("handoff code received for {client_id}");
            Some(code)
        }
        None => None,
    };
    let pid = lib::spawn_game_process(&binary, handoff).expect("start the game");
    println!("started pid {pid}");
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(20) {
        assert!(alive(pid), "the game exited after {:?}", started.elapsed());
        std::thread::sleep(Duration::from_secs(1));
    }
    println!("still running after 20 seconds");
    let _ = std::process::Command::new("kill").arg(pid.to_string()).status();
}

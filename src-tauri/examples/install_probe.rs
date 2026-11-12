// End-to-end Windows check for the game install path.
//
//   cargo run --manifest-path src-tauri/Cargo.toml --example install_probe
//
// It fetches and verifies the published signed manifest, downloads the AHD
// artifact, verifies its sha256, runs the NSIS installer silently, then checks
// that the expected per-user executable exists. This is the same code path the
// launcher command uses.

#[cfg(not(target_os = "windows"))]
fn main() {
    eprintln!("install_probe is a Windows-only end-to-end check");
    std::process::exit(2);
}

#[cfg(target_os = "windows")]
fn main() {
    use std::path::PathBuf;

    let root = std::env::var("LOCALAPPDATA")
        .map(PathBuf::from)
        .expect("LOCALAPPDATA must be set on Windows");

    let manifest = tauri::async_runtime::block_on(lakeside_launcher_lib::load_release_manifest())
        .expect("signed manifest should load and verify");
    let product = manifest
        .products
        .get("ahd")
        .expect("AHD should be present in the manifest");
    let artifact = product
        .artifacts
        .get("windows-x64")
        .expect("AHD should publish a windows-x64 artifact");

    println!(
        "installing {} {} from {}",
        product.name, product.version, artifact.url
    );

    let mut last_report = 0u64;
    let result = tauri::async_runtime::block_on(lakeside_launcher_lib::install_artifact(
        root.clone(),
        "ahd",
        &product.version,
        &artifact.url,
        artifact.sha256.as_deref().unwrap_or(""),
        &artifact.name,
        &artifact.kind,
        |downloaded, total| {
            if let Some(total) = total {
                let percent = downloaded.saturating_mul(100) / total.max(1);
                if percent >= last_report + 20 {
                    last_report = percent;
                    println!("download {percent}%");
                }
            }
        },
    ))
    .expect("install should complete");

    let executable = root.join(&result.executable);
    assert!(
        executable.is_file(),
        "installer finished but {} is missing",
        executable.display()
    );

    println!(
        "installed {} at {}",
        result.version,
        executable.display()
    );
}

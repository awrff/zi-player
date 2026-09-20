fn main() {
    check_sidecars();
    tauri_build::build();
}

/// Fail the compile with a copy-pasteable hint when `externalBin` files are absent.
/// Tauri already errors on missing sidecars; this just names the fetch script.
fn check_sidecars() {
    let triple = std::env::var("TARGET").or_else(|_| std::env::var("HOST")).expect("TARGET");
    let ext = if triple.contains("windows") { ".exe" } else { "" };
    let root = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let mut missing = Vec::new();

    for name in ["yt-dlp", "ffmpeg"] {
        let path = root
            .join("binaries")
            .join(name)
            .join(format!("{name}-{triple}{ext}"));
        println!("cargo:rerun-if-changed={}", path.display());
        let empty = std::fs::metadata(&path).map(|m| m.len() == 0).unwrap_or(true);
        if empty {
            missing.push(path);
        }
    }

    if missing.is_empty() {
        return;
    }

    let listed = missing
        .iter()
        .map(|p| format!("  - {}", p.display()))
        .collect::<Vec<_>>()
        .join("\n");
    panic!(
        "\nmissing Tauri sidecar binaries for target {triple}:\n{listed}\n\n\
         download them first:\n  bash scripts/fetch-binaries.sh\n\
         (use --all when packaging every platform)\n"
    );
}

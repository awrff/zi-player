use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

/// Video metadata returned to the frontend. Field names match the TS `VideoMeta`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoMeta {
    pub id: String,
    pub url: String,
    pub title: String,
    pub uploader: String,
    pub duration: f64,
    pub cover: String,
}

/// Resolve metadata for a Bilibili URL via `yt-dlp -J`.
#[tauri::command]
pub async fn resolve_video(app: AppHandle, url: String) -> Result<VideoMeta, String> {
    let sidecar = app.shell().sidecar("yt-dlp").map_err(|e| e.to_string())?;

    let output = sidecar
        .args(["-J", "--no-playlist", "--skip-download", "--no-warnings", url.as_str()])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_ytdlp_json(&stdout, &url)
}

/// Download the best-audio stream locally, transcode it to Vorbis (Ogg), and
/// return its absolute path. If a playable file is already cached, it is returned
/// immediately.
#[tauri::command]
pub async fn download_audio(app: AppHandle, id: String, url: String) -> Result<String, String> {
    let cache_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("audio");
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;

    // Prefer an already-transcoded file so we never re-download or re-transcode.
    if let Some(playable) = find_playable(&cache_dir, &id) {
        return Ok(playable.to_string_lossy().to_string());
    }

    // Reuse a raw download if present, otherwise fetch it with yt-dlp.
    let raw = if let Some(existing) = find_existing(&cache_dir, &id) {
        existing
    } else {
        let sidecar = app.shell().sidecar("yt-dlp").map_err(|e| e.to_string())?;
        let out_template = cache_dir.join(format!("{}.%(ext)s", id));
        let out_template_str = out_template.to_string_lossy().to_string();

        let output = sidecar
            .args([
                "-f",
                "bestaudio/best",
                "--no-playlist",
                "--no-warnings",
                "-o",
                out_template_str.as_str(),
                url.as_str(),
            ])
            .output()
            .await
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }

        find_existing(&cache_dir, &id).ok_or_else(|| "下载完成但找不到音频文件".to_string())?
    };

    // Transcode to Vorbis (Ogg) so WebKitGTK can decode it with base GStreamer plugins.
    // Fall back to the raw container when ffmpeg is missing or fails.
    match transcode_audio(&app, &raw, &cache_dir, &id).await {
        Some(playable) => Ok(playable.to_string_lossy().to_string()),
        None => Ok(normalize_container(&raw).to_string_lossy().to_string()),
    }
}

/// Download the cover thumbnail locally and return its absolute path.
/// yt-dlp supplies the Referer/User-Agent headers Bilibili's image CDN requires,
/// so the image is cached here instead of being hot-linked by the WebView.
#[tauri::command]
pub async fn fetch_cover(app: AppHandle, id: String, url: String) -> Result<String, String> {
    let cache_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("covers");
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;

    if let Some(existing) = find_existing(&cache_dir, &id) {
        return Ok(existing.to_string_lossy().to_string());
    }

    let sidecar = app.shell().sidecar("yt-dlp").map_err(|e| e.to_string())?;
    let out_template = cache_dir.join(format!("{}.%(ext)s", id));
    let out_template_str = out_template.to_string_lossy().to_string();

    let output = sidecar
        .args([
            "--skip-download",
            "--write-thumbnail",
            "--no-playlist",
            "--no-warnings",
            "-o",
            out_template_str.as_str(),
            url.as_str(),
        ])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let path = find_existing(&cache_dir, &id).ok_or_else(|| "下载完成但找不到封面文件".to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// Build a playable `http://127.0.0.1:<port>/...` URL for a cached audio file.
/// The loopback HTTP server (see `audio_server`) serves the file with Range
/// support so WebKitGTK can both play and seek it.
#[tauri::command]
pub fn audio_url(app: AppHandle, path: String) -> Result<String, String> {
    let port = app.state::<crate::audio_server::AudioServerState>().port;
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let target = Path::new(&path);

    // Defence in depth: only expose files under our own data directory.
    if !path_within(&root, target) {
        return Err("路径不在应用数据目录内".to_string());
    }

    let rel = target.strip_prefix(&root).map_err(|e| e.to_string())?;
    Ok(format!("http://127.0.0.1:{}/{}", port, rel.to_string_lossy()))
}

/// Whether `target` is `root` itself or nested under it, resolving `..` and
/// symlinks via canonicalization so path traversal cannot escape `root`.
pub(crate) fn path_within(root: &Path, target: &Path) -> bool {
    match (root.canonicalize(), target.canonicalize()) {
        (Ok(root), Ok(target)) => target.starts_with(root),
        _ => false,
    }
}

fn parse_ytdlp_json(stdout: &str, url: &str) -> Result<VideoMeta, String> {
    let value: serde_json::Value = serde_json::from_str(stdout).map_err(|e| e.to_string())?;

    let mut id = value.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    if id.is_empty() {
        id = url
            .split('?')
            .next()
            .and_then(|u| u.rsplit('/').next())
            .unwrap_or("")
            .to_string();
    }

    let title = value
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("未命名视频")
        .to_string();

    let uploader = value
        .get("uploader")
        .and_then(|v| v.as_str())
        .or_else(|| value.get("channel").and_then(|v| v.as_str()))
        .unwrap_or("未知 UP 主")
        .to_string();

    let duration = value.get("duration").and_then(|v| v.as_f64()).unwrap_or(0.0);

    let cover = value
        .get("thumbnail")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let canonical = value
        .get("webpage_url")
        .and_then(|v| v.as_str())
        .unwrap_or(url)
        .to_string();

    Ok(VideoMeta {
        id,
        url: canonical,
        title,
        uploader,
        duration,
        cover,
    })
}

/// Find a cached file whose stem equals `id`.
fn find_existing(dir: &Path, id: &str) -> Option<PathBuf> {
    std::fs::read_dir(dir).ok()?.flatten().find_map(|entry| {
        let path = entry.path();
        if path.is_file() && path.file_stem().and_then(|s| s.to_str()) == Some(id) {
            Some(path)
        } else {
            None
        }
    })
}

/// The transcoded Vorbis file for `id`, if it already exists on disk.
fn find_playable(dir: &Path, id: &str) -> Option<PathBuf> {
    let target = playable_target(dir, id);
    target.is_file().then_some(target)
}

/// The path where the transcoded Vorbis file for `id` should live.
fn playable_target(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{}.ogg", id))
}

/// Transcode a raw audio file to Vorbis in Ogg (`.ogg`) using the bundled ffmpeg
/// sidecar. Returns the transcoded path on success, or `None` so the caller can
/// fall back to the raw container (e.g. when ffmpeg is missing on this build).
async fn transcode_audio(app: &AppHandle, raw: &Path, cache_dir: &Path, id: &str) -> Option<PathBuf> {
    let target = playable_target(cache_dir, id);
    if target.is_file() {
        return Some(target);
    }

    let sidecar = app.shell().sidecar("ffmpeg").ok()?;
    let raw_str = raw.to_string_lossy().to_string();
    let target_str = target.to_string_lossy().to_string();

    let output = sidecar
        .args([
            "-y",
            "-nostdin",
            "-i",
            raw_str.as_str(),
            "-vn",
            "-c:a",
            "libvorbis",
            "-q:a",
            "5",
            target_str.as_str(),
        ])
        .output()
        .await
        .ok()?;

    if !output.status.success() || !target.is_file() {
        return None;
    }

    // Best-effort cleanup: drop the raw source to keep the cache lean.
    if raw.file_stem().and_then(|s| s.to_str()) == Some(id) {
        let _ = std::fs::remove_file(raw);
    }

    Some(target)
}

/// The target path after container normalization (pure — does not touch disk).
fn normalized_path(path: &Path) -> PathBuf {
    if path.extension().and_then(|e| e.to_str()) == Some("m4s") {
        path.with_extension("m4a")
    } else {
        path.to_path_buf()
    }
}

/// Rename containers that browsers cannot play into a playable one.
/// This is the fallback path when ffmpeg is unavailable: Bilibili DASH audio is
/// AAC inside a fragmented `.m4s` container, and renaming to `.m4a` is enough for
/// WebView2 (and WebKitGTK with the right GStreamer codecs) to play it.
fn normalize_container(path: &Path) -> PathBuf {
    let target = normalized_path(path);
    if target != path && std::fs::rename(path, &target).is_ok() {
        target
    } else {
        path.to_path_buf()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_json() -> &'static str {
        r#"{
            "id": "BV1xx411c7mD",
            "title": "测试视频",
            "uploader": "测试UP主",
            "duration": 233.0,
            "thumbnail": "https://example.com/cover.jpg",
            "webpage_url": "https://www.bilibili.com/video/BV1xx411c7mD"
        }"#
    }

    #[test]
    fn parses_ytdlp_json() {
        let meta = parse_ytdlp_json(sample_json(), "https://b23.tv/abc").unwrap();
        assert_eq!(meta.id, "BV1xx411c7mD");
        assert_eq!(meta.title, "测试视频");
        assert_eq!(meta.uploader, "测试UP主");
        assert_eq!(meta.duration, 233.0);
        assert_eq!(meta.cover, "https://example.com/cover.jpg");
        // canonical URL comes from webpage_url, not the short link
        assert_eq!(meta.url, "https://www.bilibili.com/video/BV1xx411c7mD");
    }

    #[test]
    fn falls_back_to_url_id_when_json_has_no_id() {
        let meta = parse_ytdlp_json(r#"{"title":"t","duration":1}"#, "https://www.bilibili.com/video/BV1xx411c7mE?p=2").unwrap();
        assert_eq!(meta.id, "BV1xx411c7mE");
        assert_eq!(meta.uploader, "未知 UP 主");
    }

    #[test]
    fn normalizes_m4s_to_m4a() {
        assert_eq!(
            normalized_path(Path::new("/tmp/a.m4s")).extension().and_then(|e| e.to_str()),
            Some("m4a")
        );
        assert_eq!(
            normalized_path(Path::new("/tmp/a.m4a")).extension().and_then(|e| e.to_str()),
            Some("m4a")
        );
    }

    #[test]
    fn playable_target_uses_ogg_extension() {
        let target = playable_target(Path::new("/cache"), "BV123");
        assert_eq!(target, PathBuf::from("/cache/BV123.ogg"));
    }

    #[test]
    fn find_playable_returns_none_when_absent() {
        assert_eq!(find_playable(Path::new("/nonexistent-dir"), "BV123"), None);
    }

    #[test]
    fn path_within_rejects_traversal_and_outside_paths() {
        let root = std::env::temp_dir().join("bilibili-board-test-root");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("audio")).unwrap();

        let inside = root.join("audio/BV.ogg");
        std::fs::write(&inside, b"x").unwrap();
        assert!(path_within(&root, &inside));

        let outside = root.parent().unwrap().join("bilibili-board-test-outside");
        std::fs::write(&outside, b"x").unwrap();
        assert!(!path_within(&root, &outside));

        // `..` traversal must not escape the root.
        let traversal = root.join("..").join("bilibili-board-test-outside");
        assert!(!path_within(&root, &traversal));

        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_file(&outside);
    }
}

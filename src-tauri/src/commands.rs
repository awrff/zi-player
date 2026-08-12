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

/// Download the best-audio stream locally and return its absolute path.
/// If the file is already cached, it is returned immediately.
#[tauri::command]
pub async fn download_audio(app: AppHandle, id: String, url: String) -> Result<String, String> {
    let cache_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("audio");
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;

    if let Some(existing) = find_existing(&cache_dir, &id) {
        return Ok(normalize_container(&existing).to_string_lossy().to_string());
    }

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

    let path = find_existing(&cache_dir, &id).ok_or_else(|| "下载完成但找不到音频文件".to_string())?;
    Ok(normalize_container(&path).to_string_lossy().to_string())
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

/// Find a cached audio file whose stem equals `id`.
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

/// The target path after container normalization (pure — does not touch disk).
fn normalized_path(path: &Path) -> PathBuf {
    if path.extension().and_then(|e| e.to_str()) == Some("m4s") {
        path.with_extension("m4a")
    } else {
        path.to_path_buf()
    }
}

/// Rename containers that browsers cannot play into a playable one.
/// Bilibili DASH audio is AAC inside a fragmented `.m4s` container — renaming to
/// `.m4a` is enough for WebView2/WebKitGTK to play it without ffmpeg.
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
}

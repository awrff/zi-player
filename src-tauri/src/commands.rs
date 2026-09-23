use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::Command;
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

/// Hint shown when a bundled sidecar cannot be launched (usually not fetched).
pub(crate) fn sidecar_missing_hint(name: &str) -> String {
    format!(
        "无法启动 sidecar `{name}`。请先运行 `bash scripts/fetch-binaries.sh` 后重新构建（当前平台），或使用 `--all` 下载全部平台。"
    )
}

/// Spawn/open failures that mean the sidecar binary is absent, not a video error.
pub(crate) fn looks_like_sidecar_missing(err: &str) -> bool {
    let e = err.to_ascii_lowercase();
    e.contains("no such file")
        || e.contains("os error 2")
        || e.contains("the system cannot find")
        || e.contains("program not found")
        || e.contains("sidecar not found")
        || e.contains("cannot find the path")
        || e.contains("cannot find the file")
}

fn sidecar_io_error(name: &str, err: &str) -> String {
    if looks_like_sidecar_missing(err) {
        sidecar_missing_hint(name)
    } else {
        format!("无法执行 sidecar `{name}`")
    }
}

fn open_sidecar(app: &AppHandle, name: &str) -> Result<Command, String> {
    app.shell()
        .sidecar(name)
        .map_err(|_| sidecar_missing_hint(name))
}

/// Remembers which sidecars already answered a probe in this session so
/// repeated imports stop paying the `--version` spawn cost. Only successes are
/// remembered: a missing binary that is fetched later gets probed again.
struct SidecarProbeCache {
    ok: Mutex<HashSet<String>>,
}

impl SidecarProbeCache {
    fn new() -> Self {
        Self {
            ok: Mutex::new(HashSet::new()),
        }
    }

    /// Whether a previous probe of `name` succeeded this session.
    fn check(&self, name: &str) -> bool {
        self.ok
            .lock()
            .map(|guard| guard.contains(name))
            .unwrap_or(false)
    }

    /// Record a successful probe of `name` for the rest of the session.
    fn mark_ok(&self, name: &str) {
        if let Ok(mut guard) = self.ok.lock() {
            guard.insert(name.to_string());
        }
    }
}

fn sidecar_cache() -> &'static SidecarProbeCache {
    static CACHE: OnceLock<SidecarProbeCache> = OnceLock::new();
    CACHE.get_or_init(SidecarProbeCache::new)
}

/// Real `--version` / `-version` probe of a sidecar, always executed.
async fn probe_sidecar(app: &AppHandle, name: &str) -> Result<(), String> {
    let cmd = open_sidecar(app, name)?;
    let probe: [&str; 1] = if name == "ffmpeg" {
        ["-version"]
    } else {
        ["--version"]
    };
    cmd.args(probe)
        .output()
        .await
        .map(|_| ())
        .map_err(|e| sidecar_io_error(name, &e.to_string()))
}

/// Cheap probe so missing binaries fail before download; skips the spawn once
/// the sidecar has already answered successfully this session.
async fn ensure_sidecar(app: &AppHandle, name: &str) -> Result<(), String> {
    if sidecar_cache().check(name) {
        return Ok(());
    }
    probe_sidecar(app, name).await?;
    sidecar_cache().mark_ok(name);
    Ok(())
}

async fn ensure_sidecars(app: &AppHandle, names: &[&str]) -> Result<(), String> {
    for name in names {
        ensure_sidecar(app, name).await?;
    }
    Ok(())
}

/// Names of sidecars that cannot be launched (`yt-dlp` / `ffmpeg`).
/// Diagnostics entry: always probes for real, never consults the cache.
#[tauri::command]
pub async fn check_sidecars(app: AppHandle) -> Result<Vec<String>, String> {
    let mut missing = Vec::new();
    for name in ["yt-dlp", "ffmpeg"] {
        if let Err(e) = probe_sidecar(&app, name).await {
            if e.contains("fetch-binaries.sh") || e.contains("无法启动 sidecar") {
                missing.push(name.to_string());
            }
        }
    }
    Ok(missing)
}

/// yt-dlp argv that resolves metadata AND writes the cover thumbnail in one
/// run, saving the frontend's second full page parse. `--print-json` implies
/// simulate, which skips post-processing — `--no-simulate` overrides it so
/// `--write-thumbnail` actually runs. The template uses `%(id)s` because the
/// resolved id (e.g. from a b23.tv link) is unknown before extraction.
fn resolve_video_args(url: &str, covers_dir: &Path) -> Vec<String> {
    let out_template = covers_dir.join("%(id)s.%(ext)s");
    let out_template_str = out_template.to_string_lossy().to_string();
    [
        "--no-simulate",
        "--skip-download",
        "--write-thumbnail",
        "--no-playlist",
        "--no-warnings",
        "--print-json",
        "-o",
        out_template_str.as_str(),
        url,
    ]
    .into_iter()
    .map(str::to_string)
    .collect()
}

/// Resolve metadata via plain `-J` (no thumbnail). Fallback for yt-dlp builds
/// that reject the combined metadata+thumbnail invocation.
async fn resolve_video_metadata_only(app: &AppHandle, url: &str) -> Result<VideoMeta, String> {
    let sidecar = open_sidecar(app, "yt-dlp")?;
    let output = sidecar
        .args([
            "-J",
            "--no-playlist",
            "--skip-download",
            "--no-warnings",
            url,
        ])
        .output()
        .await
        .map_err(|e| sidecar_io_error("yt-dlp", &e.to_string()))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    parse_ytdlp_json(&String::from_utf8_lossy(&output.stdout), url)
}

/// Resolve metadata for a video URL, writing the cover thumbnail as a side
/// effect when the yt-dlp build supports it. Falls back to a metadata-only
/// `-J` run when the combined invocation fails or writes no cover.
#[tauri::command]
pub async fn resolve_video(app: AppHandle, url: String) -> Result<VideoMeta, String> {
    ensure_sidecars(&app, &["yt-dlp"]).await?;
    let sidecar = open_sidecar(&app, "yt-dlp")?;

    let covers_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("covers");
    // Best effort: without the dir the thumbnail step fails and we fall back.
    let _ = std::fs::create_dir_all(&covers_dir);

    let args = resolve_video_args(&url, &covers_dir);
    let output = sidecar
        .args(args.iter().map(String::as_str).collect::<Vec<_>>())
        .output()
        .await
        .map_err(|e| sidecar_io_error("yt-dlp", &e.to_string()))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if let Ok(meta) = parse_ytdlp_json(&stdout, &url) {
            // The thumbnail step only ran if a cover file for the resolved id
            // landed in the covers dir; otherwise retire to the plain `-J` run.
            if !meta.id.is_empty() && find_existing(&covers_dir, &meta.id).is_some() {
                return Ok(meta);
            }
        }
    }

    resolve_video_metadata_only(&app, &url).await
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

    // Fail before download/transcode so a missing sidecar is not an OS error.
    if find_raw_download(&cache_dir, &id).is_some() {
        ensure_sidecars(&app, &["ffmpeg"]).await?;
    } else {
        ensure_sidecars(&app, &["yt-dlp", "ffmpeg"]).await?;
    }

    // Reuse a raw download if present, otherwise fetch it with yt-dlp.
    let raw = if let Some(existing) = find_raw_download(&cache_dir, &id) {
        existing
    } else {
        let sidecar = open_sidecar(&app, "yt-dlp")?;
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
            .map_err(|e| download_error(&sidecar_io_error("yt-dlp", &e.to_string())))?;

        if !output.status.success() {
            return Err(download_error(&String::from_utf8_lossy(&output.stderr)));
        }

        find_existing(&cache_dir, &id).ok_or_else(|| "下载完成但找不到音频文件".to_string())?
    };

    // Transcode to Vorbis (Ogg) so WebKitGTK can decode it with base GStreamer plugins.
    // Fail loudly when ffmpeg is missing or transcode fails — do not return raw AAC
    // (Linux WebKitGTK typically plays that as silence with a frozen progress bar).
    let playable = transcode_audio(&app, &raw, &cache_dir, &id)
        .await
        .map_err(|e| transcode_error(&e))?;
    Ok(playable.to_string_lossy().to_string())
}

/// Download the cover thumbnail locally and return its absolute path.
/// yt-dlp supplies the Referer/User-Agent headers the image CDN requires,
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

    let sidecar = open_sidecar(&app, "yt-dlp")?;
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
        .map_err(|e| sidecar_io_error("yt-dlp", &e.to_string()))?;

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
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位音频缓存目录：{e}"))?;
    let target = Path::new(&path);

    // Defence in depth: only expose files under our own data directory.
    if !path_within(&root, target) {
        return Err("无法生成播放地址：路径不在应用数据目录内".to_string());
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

/// Find a cached file whose stem equals `id` (any extension; used for covers).
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

/// Extensions eligible for raw-download reuse. Guards against treating
/// arbitrary same-stem junk (`.part` resume files, logs, ...) as a cached
/// download.
const RAW_DOWNLOAD_EXTENSIONS: [&str; 10] = [
    "m4a", "mp3", "webm", "opus", "ogg", "aac", "flac", "wav", "mp4", "m4v",
];

/// Find a cached file whose stem equals `id`, restricted to `extensions`.
fn find_existing_with_extensions(dir: &Path, id: &str, extensions: &[&str]) -> Option<PathBuf> {
    std::fs::read_dir(dir).ok()?.flatten().find_map(|entry| {
        let path = entry.path();
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_ascii_lowercase());
        let allowed = ext.is_some_and(|e| extensions.contains(&e.as_str()));
        if allowed && path.is_file() && path.file_stem().and_then(|s| s.to_str()) == Some(id) {
            Some(path)
        } else {
            None
        }
    })
}

/// The raw yt-dlp download for `id`, if a whitelisted container is cached.
fn find_raw_download(dir: &Path, id: &str) -> Option<PathBuf> {
    find_existing_with_extensions(dir, id, &RAW_DOWNLOAD_EXTENSIONS)
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

/// User-facing Chinese error when yt-dlp cannot fetch the audio stream.
fn download_error(detail: &str) -> String {
    let detail = detail.trim();
    if detail.contains("下载音频失败") || detail.contains("fetch-binaries.sh") {
        return detail.to_string();
    }
    if detail.is_empty() {
        "下载音频失败：yt-dlp 未返回原因".to_string()
    } else {
        format!("下载音频失败：{detail}")
    }
}

/// User-facing Chinese error when Vorbis transcode cannot complete.
fn transcode_error(detail: &str) -> String {
    let detail = detail.trim();
    if detail.contains("音频转码失败") || detail.contains("fetch-binaries.sh") {
        return detail.to_string();
    }
    format!("音频转码失败：{detail}。未生成可播放的 OGG，Linux 上无法解码 AAC。")
}

/// Temp path for an in-flight Ogg write. Must end with a real muxer extension
/// (`.ogg`), not `.ogg.tmp` — ffmpeg refuses bare `.tmp` without `-f`.
fn transcode_temp_path(cache_dir: &Path, id: &str) -> PathBuf {
    cache_dir.join(format!("{id}.tmp.ogg"))
}

/// ffmpeg argv for AAC/raw → Vorbis Ogg. Always passes `-f ogg` so the muxer
/// never depends on guessing from a temporary filename.
fn ffmpeg_ogg_args(input: &str, output: &str) -> Vec<String> {
    [
        "-y",
        "-nostdin",
        "-i",
        input,
        "-vn",
        "-c:a",
        "libvorbis",
        "-q:a",
        "5",
        "-f",
        "ogg",
        output,
    ]
    .into_iter()
    .map(str::to_string)
    .collect()
}
/// Transcode a raw audio file to Vorbis in Ogg (`.ogg`) using the bundled ffmpeg
/// sidecar. Writes `{id}.tmp.ogg` then renames so a failed run cannot cache junk.
async fn transcode_audio(app: &AppHandle, raw: &Path, cache_dir: &Path, id: &str) -> Result<PathBuf, String> {
    let target = playable_target(cache_dir, id);
    if target.is_file() {
        return Ok(target);
    }

    let sidecar = open_sidecar(app, "ffmpeg")?;
    let raw_str = raw.to_string_lossy().to_string();
    // Write to a temp file then rename so a failed ffmpeg cannot leave a
    // truncated `{id}.ogg` that the next click would treat as a cache hit.
    // Use `.tmp.ogg` (not `.ogg.tmp`) so ffmpeg can pick the ogg muxer from
    // the extension even if `-f` were omitted; still pass `-f ogg` explicitly.
    let tmp = transcode_temp_path(cache_dir, id);
    let _ = std::fs::remove_file(&tmp);
    let tmp_str = tmp.to_string_lossy().to_string();
    let args = ffmpeg_ogg_args(&raw_str, &tmp_str);

    let output = sidecar
        .args(args.iter().map(String::as_str).collect::<Vec<_>>())
        .output()
        .await
        .map_err(|e| {
            let _ = std::fs::remove_file(&tmp);
            sidecar_io_error("ffmpeg", &e.to_string())
        })?;

    if !output.status.success() || !tmp.is_file() {
        let _ = std::fs::remove_file(&tmp);
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = stderr.trim();
        return Err(if detail.is_empty() {
            "ffmpeg 转码未写出 OGG 文件".to_string()
        } else {
            detail.to_string()
        });
    }

    if let Err(e) = std::fs::rename(&tmp, &target) {
        let _ = std::fs::remove_file(&tmp);
        return Err(format!("无法写入 OGG：{e}"));
    }

    // Best-effort cleanup: drop the raw source to keep the cache lean.
    if raw.file_stem().and_then(|s| s.to_str()) == Some(id) {
        let _ = std::fs::remove_file(raw);
    }

    Ok(target)
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
    fn sidecar_hint_names_fetch_script() {
        let hint = sidecar_missing_hint("ffmpeg");
        assert!(hint.contains("ffmpeg"));
        assert!(hint.contains("scripts/fetch-binaries.sh"));
        assert!(hint.contains("--all"));
    }

    #[test]
    fn missing_sidecar_io_error_is_chinese_without_native_dump() {
        assert!(looks_like_sidecar_missing("No such file or directory (os error 2)"));
        assert!(looks_like_sidecar_missing("program not found"));
        assert!(!looks_like_sidecar_missing("HTTP Error 403: Forbidden"));
        let msg = sidecar_io_error("yt-dlp", "Error: No such file or directory (os error 2)");
        assert!(msg.contains("fetch-binaries.sh"));
        assert!(msg.contains("yt-dlp"));
        assert!(!msg.contains("os error"));
        assert!(!msg.contains("No such file"));
    }

    #[test]
    fn transcode_error_is_chinese_and_does_not_pretend_success() {
        let msg = transcode_error("无法启动 sidecar `ffmpeg`");
        assert!(msg.contains("转码失败"));
        assert!(msg.contains("ffmpeg"));
        assert!(msg.contains("OGG") || msg.contains("ogg"));
        assert!(!msg.contains("回退"));
    }

    #[test]
    fn transcode_error_passes_through_fetch_binaries_hint() {
        let hint = sidecar_missing_hint("ffmpeg");
        assert_eq!(transcode_error(&hint), hint);
    }

    #[test]
    fn transcode_error_does_not_double_wrap() {
        let inner = transcode_error("ffmpeg 缺失");
        let again = transcode_error(&inner);
        assert_eq!(inner.matches("音频转码失败").count(), 1);
        assert_eq!(again, inner);
    }

    #[test]
    fn download_error_is_chinese() {
        let msg = download_error("HTTP Error 403: Forbidden");
        assert!(msg.contains("下载音频失败"));
        assert!(msg.contains("403"));
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
    fn playable_target_uses_ogg_extension() {
        let target = playable_target(Path::new("/cache"), "BV123");
        assert_eq!(target, PathBuf::from("/cache/BV123.ogg"));
    }

    #[test]
    fn transcode_temp_path_ends_with_ogg_not_tmp() {
        let tmp = transcode_temp_path(Path::new("/cache"), "BV1NZffBRESK");
        assert_eq!(tmp, PathBuf::from("/cache/BV1NZffBRESK.tmp.ogg"));
        let name = tmp.file_name().and_then(|s| s.to_str()).unwrap();
        assert!(name.ends_with(".ogg"), "ffmpeg needs a real muxer extension, got {name}");
        assert!(!name.ends_with(".ogg.tmp"));
    }

    #[test]
    fn ffmpeg_ogg_args_force_ogg_muxer() {
        let args = ffmpeg_ogg_args("/in.m4a", "/out.tmp.ogg");
        assert!(args.windows(2).any(|w| w[0] == "-f" && w[1] == "ogg"));
        assert_eq!(args.last().map(String::as_str), Some("/out.tmp.ogg"));
        assert!(!args.iter().any(|a| a.ends_with(".ogg.tmp")));
    }

    #[test]
    fn resolve_video_args_writes_thumbnail_in_one_pass() {
        let args = resolve_video_args("https://b23.tv/abc", Path::new("/covers"));
        // --no-simulate must override --print-json's implicit simulate so the
        // thumbnail post-processor actually runs.
        assert!(args.iter().any(|a| a == "--no-simulate"));
        assert!(args.iter().any(|a| a == "--write-thumbnail"));
        assert!(args.iter().any(|a| a == "--print-json"));
        assert!(args.iter().any(|a| a == "--skip-download"));
        assert!(args.iter().any(|a| a == "--no-playlist"));

        let o = args.iter().position(|a| a == "-o").expect("-o present");
        let template = &args[o + 1];
        let covers_prefix = Path::new("/covers").to_string_lossy().to_string();
        assert!(
            template.starts_with(&covers_prefix),
            "template {template} must target the covers dir"
        );
        assert!(
            template.contains("%(id)s.%(ext)s"),
            "template {template} must keep the id field"
        );

        // URL is the last positional argument.
        assert_eq!(args.last().map(String::as_str), Some("https://b23.tv/abc"));
    }

    #[test]
    fn find_playable_returns_none_when_absent() {
        assert_eq!(find_playable(Path::new("/nonexistent-dir"), "BV123"), None);
    }

    #[test]
    fn find_playable_ignores_partial_tmp() {
        let dir = std::env::temp_dir().join("zi-player-ogg-tmp");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("BV123.tmp.ogg"), b"partial").unwrap();
        assert_eq!(find_playable(&dir, "BV123"), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sidecar_probe_cache_remembers_only_marked_names() {
        let cache = SidecarProbeCache::new();
        assert!(!cache.check("yt-dlp"));
        cache.mark_ok("yt-dlp");
        assert!(cache.check("yt-dlp"));
        assert!(!cache.check("ffmpeg"));
    }

    #[test]
    fn find_raw_download_reuses_whitelisted_containers_only() {
        let dir = std::env::temp_dir().join("zi-player-raw-ext");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        // yt-dlp resume leftovers and unrelated junk must not be reused.
        std::fs::write(dir.join("BV123.part"), b"partial").unwrap();
        std::fs::write(dir.join("BV123.log"), b"junk").unwrap();
        assert_eq!(find_raw_download(&dir, "BV123"), None);

        std::fs::write(dir.join("BV123.m4a"), b"audio").unwrap();
        assert_eq!(
            find_raw_download(&dir, "BV123"),
            Some(dir.join("BV123.m4a"))
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn find_existing_still_matches_cover_extensions() {
        let dir = std::env::temp_dir().join("zi-player-cover-ext");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        std::fs::write(dir.join("BV123.jpg"), b"image").unwrap();
        assert_eq!(find_existing(&dir, "BV123"), Some(dir.join("BV123.jpg")));
        assert_eq!(find_raw_download(&dir, "BV123"), None);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn path_within_rejects_traversal_and_outside_paths() {
        let root = std::env::temp_dir().join("zi-player-test-root");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("audio")).unwrap();

        let inside = root.join("audio/BV.ogg");
        std::fs::write(&inside, b"x").unwrap();
        assert!(path_within(&root, &inside));

        let outside = root.parent().unwrap().join("zi-player-test-outside");
        std::fs::write(&outside, b"x").unwrap();
        assert!(!path_within(&root, &outside));

        // `..` traversal must not escape the root.
        let traversal = root.join("..").join("zi-player-test-outside");
        assert!(!path_within(&root, &traversal));

        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_file(&outside);
    }
}

# Sidecars (yt-dlp + ffmpeg)

Place the standalone binaries here so `tauri build` can bundle them as
sidecars. The app uses them to resolve metadata, download audio/cover, and
transcode audio.

## Required file names

Tauri appends the target triple + extension at build time.

| Binary | Windows x64                          | Linux x64                          | macOS x64                       | macOS arm64                      |
| ------ | ------------------------------------ | ---------------------------------- | ------------------------------- | -------------------------------- |
| yt-dlp | `yt-dlp-x86_64-pc-windows-msvc.exe`  | `yt-dlp-x86_64-unknown-linux-gnu`  | `yt-dlp-x86_64-apple-darwin`    | `yt-dlp-aarch64-apple-darwin`    |
| ffmpeg | `ffmpeg-x86_64-pc-windows-msvc.exe`  | `ffmpeg-x86_64-unknown-linux-gnu`  | `ffmpeg-x86_64-apple-darwin`    | `ffmpeg-aarch64-apple-darwin`    |

## Downloads

- **yt-dlp**: https://github.com/yt-dlp/yt-dlp/releases (e.g. `yt-dlp.exe` for
  Windows) — rename to the names above.
- **ffmpeg**: a static build **with `libvorbis`** (e.g. BtbN
  https://github.com/BtbN/FFmpeg-Builds/releases for Windows/Linux, or
  evermeet.cx for macOS) — extract and rename to the names above.

## Notes

- Without these binaries `tauri dev`/`tauri build` will still start, but
  resolving/downloading/transcoding will fail at runtime. `cargo test` and
  `tauri build` also require the current target's binaries to be present.
- The app downloads bilibili's best-audio stream (AAC in a fragmented `.m4s`
  container) and **transcodes it to Vorbis in Ogg (`.ogg`)** with ffmpeg, so
  WebKitGTK can decode it using only `gstreamer1.0-plugins-base` (always present
  with WebKitGTK). If ffmpeg is missing, playback falls back to the raw
  `.m4s`/`.m4a` file.
- Covers are downloaded by yt-dlp (`--write-thumbnail`), which supplies the
  `Referer`/`User-Agent` headers bilibili's image CDN requires (plain `<img>`
  requests from the WebView are 403'd).

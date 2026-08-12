# yt-dlp sidecar

Place the yt-dlp standalone binaries here so `tauri build` can bundle them as
sidecars. The app resolves metadata and downloads audio through them.

Required file names (Tauri appends the target triple + extension at build time):

| Platform            | File to place here                                        |
| ------------------- | --------------------------------------------------------- |
| Windows x64         | `yt-dlp-x86_64-pc-windows-msvc.exe`                       |
| Linux x64           | `yt-dlp-x86_64-unknown-linux-gnu`                         |
| macOS x64           | `yt-dlp-x86_64-apple-darwin`                              |
| macOS arm64         | `yt-dlp-aarch64-apple-darwin`                             |

Download the latest `yt-dlp` binaries from https://github.com/yt-dlp/yt-dlp/releases
(e.g. `yt-dlp.exe` for Windows) and rename them to the names above.

## Notes

- Without these binaries `tauri dev`/`tauri build` will still start, but
  resolving/downloading videos will fail at runtime.
- ffmpeg is intentionally **not** required: bilibili's best-audio stream is AAC
  in a fragmented `.m4s` container, which the app renames to `.m4a` so WebView2
  and WebKitGTK can play it directly.
- On Linux, make sure the packaged GStreamer codecs (AAC + MP4 demux) are
  available, e.g. Ubuntu: `gstreamer1.0-plugins-good`.

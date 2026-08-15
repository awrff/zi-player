# BiliBoard

一个跨平台桌面应用：解析 B 站视频链接，把每个视频渲染成一张会旋转的黑胶唱片
（封面 + 唱片 + 名称）放在磨砂玻璃 board 上，并以纯音频方式播放。

## 快速开始

```bash
# 1. 安装前端依赖
npm install

# 2. 下载 sidecar 二进制（yt-dlp + ffmpeg，二进制不入库）
bash scripts/fetch-binaries.sh

# 3. 启动桌面应用
npm run tauri dev
```

## 技术栈

- **外壳**：Tauri v2（Rust + WebView）—— 安装包约 21 MB、启动快、支持全局快捷键 / 托盘 / 剪贴板
- **前端**：React 19 + TypeScript + Vite + Ant Design 6（Ubuntu 简约风 + 磨砂玻璃主题）
- **状态**：Zustand（`persist` 持久化到 localStorage）
- **解析/下载**：yt-dlp（Tauri sidecar，仅音频流）+ ffmpeg（Tauri sidecar，AAC → Vorbis 转码）
- **测试**：Vitest + React Testing Library（单元）、Playwright（集成）

## 目录结构

```
src/
  lib/          native 适配器、解析器、播放器、导入器
  store/        Zustand 视频管理 store
  hooks/        usePlayer / useClipboardWatch / useGlobalShortcut
  components/   Board / Turntable / VinylDisc / PlayerBar / 弹窗
  styles/       Ubuntu 磨砂玻璃主题 + 全局样式
src-tauri/
  src/          Rust 命令（resolve_video / download_audio）、托盘、窗口生命周期
  binaries/     yt-dlp / ffmpeg sidecar 放置目录（由 scripts/fetch-binaries.sh 生成）
tests/e2e/      Playwright 集成测试
```

## 先决条件

1. **Node.js 22+** 与 npm。
2. **Rust 工具链**：https://www.rust-lang.org/learn/get-started#installing-rust
   （仅编译 `src-tauri` 需要；运行前端与所有测试不需要）。
3. **yt-dlp / ffmpeg sidecar**：见下方「yt-dlp sidecar」与「ffmpeg sidecar」。

## yt-dlp sidecar

yt-dlp 二进制体积较大且可从官方 release 获取，因此**不入库**。首次构建前按平台
下载并重命名后放入 `src-tauri/binaries/`：

```bash
# Windows x64
curl -L -o src-tauri/binaries/yt-dlp-x86_64-pc-windows-msvc.exe \
  https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe

# Linux x64
curl -L -o src-tauri/binaries/yt-dlp-x86_64-unknown-linux-gnu \
  https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux

# macOS x64
curl -L -o src-tauri/binaries/yt-dlp-x86_64-apple-darwin \
  https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos

# macOS arm64（与 x64 同源二进制，经 Rosetta 2 运行）
curl -L -o src-tauri/binaries/yt-dlp-aarch64-apple-darwin \
  https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos
```

> 未放置 sidecar 时 `cargo test` / `tauri build` 会因找不到资源文件而失败。
> 推荐直接用 `bash scripts/fetch-binaries.sh` 一键下载当前平台（`--all` 下载全部平台）。

## ffmpeg sidecar

ffmpeg 用于把下载到的 AAC 音频转码为 Vorbis（`.ogg`），使 Linux 的 WebKitGTK 只用其硬依赖的
`gstreamer1.0-plugins-base` 即可解码，无需额外系统包。二进制同样不入库，按平台下载**含 libvorbis 的
静态构建**，解压后重命名放入 `src-tauri/binaries/`：

| 平台        | 文件                                        | 来源                                        |
| ----------- | ------------------------------------------- | ------------------------------------------- |
| Windows x64 | `ffmpeg-x86_64-pc-windows-msvc.exe`         | BtbN / gyan.dev 的 `ffmpeg.exe`             |
| Linux x64   | `ffmpeg-x86_64-unknown-linux-gnu`           | BtbN 或 johnvansickle.com 静态 `ffmpeg`     |
| macOS x64   | `ffmpeg-x86_64-apple-darwin`                | evermeet.cx / BtbN                          |
| macOS arm64 | `ffmpeg-aarch64-apple-darwin`               | evermeet.cx / BtbN                          |

> 若未放置 ffmpeg sidecar，播放会回退到原始 `.m4s`/`.m4a`（Windows 仍可播放；Linux 会因缺
> AAC 解码器而无声、进度条不动）。

## 常用命令

```bash
npm install                # 安装依赖
npm run dev                # 仅启动前端（浏览器调试）
npm run dev:mock           # 以 mock 原生层启动前端（Playwright 使用）
npm run tauri dev          # 启动完整桌面应用（需要 Rust + yt-dlp）

npm test                   # Vitest 单元测试
npm run test:e2e           # Playwright 集成测试（首次需先 npm run e2e:install）
npm run e2e:install        # 下载 Playwright Chromium

npm run tauri build        # 打包 Windows/Linux/macOS 安装包
```

打包产物位于 `src-tauri/target/release/bundle/`（Windows 为 `nsis/` 与 `msi/`，
Linux 为 `deb/` / `appimage/`，macOS 为 `dmg/` / `macos/`）。

## 功能

- **链接解析**：识别 `bilibili.com/video/BV...`、`av...`、`b23.tv` 短链。
- **唱片 board**：封面在唱片机上方（不遮挡整机）、唱片播放时旋转、名称在正下方。
- **视频管理**：添加 / 删除 / 重命名 / 清空 / 搜索过滤。
- **剪贴板导入**：打开应用（或唤起窗口）时检测剪贴板中的 B 站链接并提示导入。
- **全局快捷键**：`Ctrl+Alt+B` 从任意位置唤起应用；关闭窗口隐藏到托盘。
- **响应式**：board 使用 `auto-fill/minmax` 网格，随窗口宽度自适应列数。

## 测试说明

- 所有原生能力都收敛在 `src/lib/native.ts` 适配器上；单元测试与 Playwright 通过
  `VITE_MOCK_TAURI=1`（`.env.mock`）切换到 `native.mock.ts`，因此无需 Rust 宿主。
- 集成测试覆盖：元素显示（封面/唱片/名称）、布局分布（不重叠、不越界、间距一致）、
  增删改/播放旋转/剪贴板导入交互、响应式列数变化与无横向溢出。

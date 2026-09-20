# BiliBoard

一个跨平台桌面应用：解析 B 站视频链接，把每个视频渲染成一张会旋转的黑胶唱片
（封面 + 唱片 + 名称）放在磨砂玻璃 board 上，并以纯音频方式播放。

## 快速开始

```bash
# 1. 安装前端依赖（需要 Node.js 22+）
npm install

# 2. 下载 sidecar 二进制（yt-dlp + ffmpeg，二进制不入库）
bash scripts/fetch-binaries.sh            # 当前平台
# bash scripts/fetch-binaries.sh --all    # 交叉打包时下载全部 4 个平台

# 3. 启动桌面应用（还需要本机 Rust + 系统 WebView 依赖，见「先决条件」）
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

前端与单元测试只需要 Node；`npm run tauri dev` / `tauri build` / `cargo test` 还需要本机系统依赖。
精简的 CI / agent 镜像通常缺这些包，**完整桌面构建必须在装好依赖的开发机上跑**。

1. **Node.js 22+** 与 npm。
2. **Rust 工具链**（`src-tauri` 为 edition 2021）：
   - 用 [rustup](https://www.rust-lang.org/learn/get-started#installing-rust) 安装 **stable**。
   - 本仓库锁定 `rust-version = "1.77.2"`（Tauri 2.11 / `tauri-plugin-shell` 的 MSRV）。发行版自带的旧 `rustc` 往往不够，请 `rustup update stable`。
   - Windows 请使用 **MSVC** 工具链（`rustup default stable-msvc`），不要用 gnu。
3. **系统 WebView / 编译依赖**（只在编译或运行桌面壳时需要）：
   - **Linux**：Tauri 2 需要 **webkit2gtk 4.1**（不是 4.0）。Debian / Ubuntu：
     ```bash
     sudo apt update
     sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
       libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev \
       libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev
     ```
     其他发行版对应包名见 [Tauri 官方先决条件](https://v2.tauri.app/start/prerequisites/)。
   - **macOS**：Xcode Command Line Tools（`xcode-select --install`）。
   - **Windows**：Visual Studio 「使用 C++ 的桌面开发」+ Edge WebView2 Runtime。
4. **yt-dlp / ffmpeg sidecar**：见下一节。二进制不入库，缺了会直接编不过或 Linux 上无声。

## Sidecar 二进制（yt-dlp + ffmpeg）

yt-dlp 负责解析 / 拉音频流，ffmpeg 把 AAC 转成 Vorbis（`.ogg`），这样 Linux WebKitGTK
只需自带的 `gstreamer1.0-plugins-base` 就能播。两者都从官方构建下载，**不进 git**。

`tauri.conf.json` 的 `bundle.externalBin` 使用**嵌套路径**（相对 `src-tauri/`）：

```
src-tauri/binaries/yt-dlp/yt-dlp-<target-triple>[.exe]
src-tauri/binaries/ffmpeg/ffmpeg-<target-triple>[.exe]
```

例如 Linux x64：

```
src-tauri/binaries/yt-dlp/yt-dlp-x86_64-unknown-linux-gnu
src-tauri/binaries/ffmpeg/ffmpeg-x86_64-unknown-linux-gnu
```

不要把文件直接放到 `src-tauri/binaries/yt-dlp-<triple>`（扁平路径）；Tauri 找不到。

### 下载

```bash
bash scripts/fetch-binaries.sh            # 只拉当前主机平台（日常开发）
bash scripts/fetch-binaries.sh --all      # linux-x64 / macos-x64 / macos-arm64 / windows-x64
bash scripts/fetch-binaries.sh --check    # 检查当前平台文件是否已就位
bash scripts/check-sidecars.sh            # 校验脚本路径、externalBin、ACL、文档一致
```

`--all` 给交叉打包用：本机是 Linux 也能把 Windows / macOS 的 sidecar 先下齐。
脚本依赖 `curl` 或 `wget`；Linux 包还要 `tar` + `xz`，Windows / macOS 包要 `unzip`。

| 平台        | target triple                 | yt-dlp 来源                         | ffmpeg 来源                                      |
| ----------- | ----------------------------- | ----------------------------------- | ------------------------------------------------ |
| Linux x64   | `x86_64-unknown-linux-gnu`    | GitHub `yt-dlp_linux`               | BtbN `linux64-gpl` 静态构建                      |
| macOS x64   | `x86_64-apple-darwin`         | GitHub `yt-dlp_macos`               | evermeet.cx                                      |
| macOS arm64 | `aarch64-apple-darwin`        | GitHub `yt-dlp_macos`（Rosetta 2）  | evermeet.cx x86_64 构建（需 Rosetta 2）          |
| Windows x64 | `x86_64-pc-windows-msvc`      | GitHub `yt-dlp.exe`                 | BtbN `win64-gpl`                                 |

当前 host 的 triple：`rustc --print host-tuple`（Rust < 1.84 则看 `rustc -Vv` 的 `host:`）。

### 缺文件时会发生什么

- **构建期**：`src-tauri/build.rs` 会在 `tauri build` / `cargo test` 前检查当前 target 的两个 sidecar；找不到就 panic，并提示运行 `bash scripts/fetch-binaries.sh`。
- **运行期**：yt-dlp 拉不起来会返回明确错误；ffmpeg 缺失时会回退到原始 `.m4s`/`.m4a`。Windows 往往还能播；**Linux 缺 AAC 解码器会无声、进度条不动**。请用 `--check` 确认 ffmpeg 已打包。

## 常用命令

```bash
npm install                # 安装依赖
npm run dev                # 仅启动前端（浏览器调试）
npm run dev:mock           # 以 mock 原生层启动前端（Playwright 使用）
npm run tauri dev          # 启动完整桌面应用（需要 Rust + 系统依赖 + sidecar）

npm test                   # Vitest 单元测试（不需要 Rust / sidecar）
npm run test:e2e           # Playwright 集成测试（首次需先 npm run e2e:install）
npm run e2e:install        # 下载 Playwright Chromium

npm run tauri build        # 打包 Windows/Linux/macOS 安装包
```

`npm run tauri build` **不能**在缺 webkit2gtk-4.1 或过旧 Rust 的环境里完成。先满足「先决条件」，再在对应平台上打包。

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

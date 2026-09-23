# 第三方组件声明（THIRD-PARTY NOTICES）

ZI Player 本体以 [MIT 许可证](./LICENSE) 发布。应用随包分发了以下第三方二进制与依赖，它们各自的许可条款继续适用。

## 随包分发的 sidecar 二进制

| 组件 | 许可证 | 来源 |
| --- | --- | --- |
| yt-dlp | Unlicense（公有领域） | https://github.com/yt-dlp/yt-dlp |
| ffmpeg | GPL-3.0（BtbN `*-gpl` 构建） | https://github.com/BtbN/FFmpeg-Builds/releases |

- yt-dlp 与 ffmpeg 以**独立子进程（Tauri sidecar）**方式被调用，与本应用属聚合分发，不构成本项目代码的衍生。
- ffmpeg 采用 GPL-3.0 构建，依据 GPL-3.0，你可以从
  https://github.com/BtbN/FFmpeg-Builds/releases 获取对应版本构建的源码及构建脚本。该构建亦内含 FFmpeg 可选组件，各自许可见 [FFmpeg 源码树](https://github.com/FFmpeg/FFmpeg) 的 `LICENSE.md`。

## 代码依赖

本项目的前端与 Rust 依赖均为各自的宽松许可证（主要是 MIT / Apache-2.0 / BSD / ISC），完整清单与版本以以下文件为准，不在此逐包罗列：

- 前端：`package.json` / `package-lock.json`
- Rust：`src-tauri/Cargo.toml` / `src-tauri/Cargo.lock`

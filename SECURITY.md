# 安全政策

## 支持的版本

目前只为最新正式 release 提供安全修复（当前为 0.2.x）。请先升级到最新版本再报告问题。

## 如何报告漏洞

**请不要在公开 Issue 中描述安全漏洞。**

请使用 GitHub 的私密漏洞上报：仓库页 → **Security** → **Report a vulnerability**，描述复现步骤、影响范围与相关版本。

- 会在收到报告后尽快响应并跟进修复进度
- 修复发布后会在对应的 Release 与 CHANGELOG 中致谢（除非你希望匿名）

## 范围说明

本项目的应用代码与打包配置在上述范围内。以下情况请向上游项目报告，不属于本项目能修复的范围：

- **yt-dlp** 的解析或下载缺陷：https://github.com/yt-dlp/yt-dlp/security
- **ffmpeg** 的媒体处理漏洞：https://ffmpeg.org/security.html
- **Tauri** 框架本身：https://github.com/tauri-apps/tauri/security

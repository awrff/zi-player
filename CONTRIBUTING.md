# 贡献指南

感谢关注 ZI Player！欢迎提交 Issue 与 Pull Request。

## 环境要求

开始前请先阅读 [README「先决条件」](./README.md#先决条件)——它详细列出了 Node / Rust 工具链与各平台的系统 WebView 依赖，这里不再重复。

简版：

- Node.js 22+（见 `.nvmrc`）
- Rust stable 1.85+（`rustup update stable`；Windows 用 MSVC 工具链）
- `npm run tauri dev` / `tauri build` / `cargo test` 需要系统依赖与 sidecar 二进制

## 本地开发

```bash
npm install                       # 安装前端依赖
bash scripts/fetch-binaries.sh    # 下载 yt-dlp / ffmpeg sidecar（不入库）
npm run tauri dev                 # 启动完整桌面应用

# 不想装 Rust？前端可单独以 mock 原生层启动：
npm run dev:mock
```

所有原生能力都收敛在 `src/lib/native.ts` 适配器上；单元测试与 Playwright 通过 `VITE_MOCK_TAURI=1` 切换到 `native.mock.ts`，无需 Rust 宿主。

## 测试

提交前请确保以下检查通过（CI 会跑同样的内容）：

```bash
npx tsc --noEmit                  # 类型检查
npm test                          # Vitest 单元测试
npm run test:e2e                  # Playwright 集成测试（首次需 npm run e2e:install）
cargo test --locked --manifest-path src-tauri/Cargo.toml   # Rust 测试（需要 sidecar）
```

## 分支与提交

- `develop` 是默认开发分支：从 `develop` 拉功能分支，PR 目标也是 `develop`
- commit message 使用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/) 风格：
  `feat:` / `fix:` / `ci:` / `chore:` / `docs:` / `style:` 等
- 一个 PR 聚焦一件事；改动较大时先开 Issue 讨论

## CI 说明

PR 与 push 到 `develop` 会触发 CI（Linux + Windows）：类型检查、Vitest、Playwright（仅 Linux）、sidecar 自检与 `cargo test --locked`。合并到 `master` 由维护者操作，走 Release 流程自动出包，详见 [README「发版」](./README.md#发版)。

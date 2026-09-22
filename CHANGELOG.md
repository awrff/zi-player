# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- GitHub Actions Check / CI / Release：合 `master` 按 `VERSION` 自动打补丁版；Windows NSIS + Linux deb/AppImage + `latest.json` + `SHA256SUMS`
- In-app updater (signed artifacts + `latest.json`). Private repositories cannot serve update assets until the repo is public
- `VERSION`（`X.Y`）与 `scripts/next-version.mjs` 计算下一号；develop 发 `vX.Y.Z-rc.N`（不计入正式 Z）

## [0.2.0] - 2026-09-21

- Playlists and bottom player bar

## [0.1.2] - 2026-09-20

- Preparing status, empty-board guide, duplicate-import feedback

## [0.1.1] - 2026-09-20

- Promote develop; Chinese errors for playback / sidecar / import

[Unreleased]: https://github.com/awrff/bilibili-board/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/awrff/bilibili-board/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/awrff/bilibili-board/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/awrff/bilibili-board/releases/tag/v0.1.1

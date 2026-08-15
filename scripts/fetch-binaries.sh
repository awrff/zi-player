#!/usr/bin/env bash
#
# fetch-binaries.sh — 下载 Tauri sidecar 二进制（yt-dlp + ffmpeg）
#
# 这些二进制体积较大，不入 git（见 .gitignore 的 src-tauri/binaries/）。
# 全新 clone 后运行本脚本即可按平台下载并放到 Tauri 期望的路径：
#   src-tauri/binaries/{yt-dlp,ffmpeg}/<name>-<target-triple>[.exe]
#
# 用法：
#   bash scripts/fetch-binaries.sh            # 下载当前平台
#   bash scripts/fetch-binaries.sh --all      # 下载全部 4 个平台（跨平台打包用）
#   bash scripts/fetch-binaries.sh --help     # 帮助
#
# 依赖：curl（或 wget）、tar、xz、unzip。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$ROOT/src-tauri/binaries"

YTDLP_BASE="https://github.com/yt-dlp/yt-dlp/releases/latest/download"
FFMPEG_BTB_BASE="https://github.com/BtbN/FFmpeg-Builds/releases/latest/download"
FFMPEG_EVERMEET="https://evermeet.cx/ffmpeg/getrelease/zip"

# 临时工作目录
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

info()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m!!\033[0m %s\n' "$*"; }
die()   { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# 选择下载工具
if command -v curl >/dev/null 2>&1; then
  download() { curl -fL --retry 3 -o "$2" "$1"; }
elif command -v wget >/dev/null 2>&1; then
  download() { wget -q -O "$2" "$1"; }
else
  die "未找到 curl 或 wget，请先安装其一。"
fi

require() {
  command -v "$1" >/dev/null 2>&1 || die "缺少依赖：$1"
}

# 按平台下载一套二进制。key 形如 linux-x64 / macos-x64 / macos-arm64 / windows-x64
fetch_platform() {
  local key="$1" triple ytdlp_asset ffmpeg_src
  case "$key" in
    linux-x64)
      triple="x86_64-unknown-linux-gnu"
      ytdlp_asset="yt-dlp_linux"
      ffmpeg_src="linux64"
      ;;
    macos-x64)
      triple="x86_64-apple-darwin"
      ytdlp_asset="yt-dlp_macos"
      ffmpeg_src="evermeet"
      ;;
    macos-arm64)
      triple="aarch64-apple-darwin"
      ytdlp_asset="yt-dlp_macos"
      ffmpeg_src="evermeet"
      ;;
    windows-x64)
      triple="x86_64-pc-windows-msvc"
      ytdlp_asset="yt-dlp.exe"
      ffmpeg_src="win64"
      ;;
    *) die "未知平台：$key";;
  esac

  info "下载 $key (triple: $triple)"

  # --- yt-dlp ---
  local ytdlp_name="yt-dlp-$triple"
  case "$key" in
    windows-x64) ytdlp_name="yt-dlp-$triple.exe";;
  esac
  download "$YTDLP_BASE/$ytdlp_asset" "$TMP/yt-dlp"
  install -m 0755 "$TMP/yt-dlp" "$BIN/yt-dlp/$ytdlp_name"
  info "  yt-dlp  → $BIN/yt-dlp/$ytdlp_name"

  # --- ffmpeg ---
  local ffmpeg_name="ffmpeg-$triple"
  case "$key" in
    windows-x64) ffmpeg_name="ffmpeg-$triple.exe";;
  esac

  case "$ffmpeg_src" in
    linux64)
      require tar
      download "$FFMPEG_BTB_BASE/ffmpeg-master-latest-linux64-gpl.tar.xz" "$TMP/ffmpeg.tar.xz"
      tar -xJf "$TMP/ffmpeg.tar.xz" -C "$TMP"
      install -m 0755 "$TMP"/ffmpeg-*/bin/ffmpeg "$BIN/ffmpeg/$ffmpeg_name"
      ;;
    win64)
      require unzip
      download "$FFMPEG_BTB_BASE/ffmpeg-master-latest-win64-gpl.zip" "$TMP/ffmpeg.zip"
      unzip -q "$TMP/ffmpeg.zip" -d "$TMP"
      install -m 0755 "$TMP"/ffmpeg-*/bin/ffmpeg.exe "$BIN/ffmpeg/$ffmpeg_name"
      ;;
    evermeet)
      require unzip
      if [ "$key" = "macos-arm64" ]; then
        warn "evermeet.cx 只提供 x86_64 构建；macOS arm64 将下载 x86_64 版（需 Rosetta 2）"
      fi
      download "$FFMPEG_EVERMEET" "$TMP/ffmpeg-evermeet.zip"
      unzip -qo "$TMP/ffmpeg-evermeet.zip" -d "$TMP/evermeet"
      install -m 0755 "$TMP/evermeet/ffmpeg" "$BIN/ffmpeg/$ffmpeg_name"
      ;;
  esac
  info "  ffmpeg → $BIN/ffmpeg/$ffmpeg_name"
}

detect_platform() {
  local os arch
  case "$(uname -s)" in
    Linux)  os="linux";;
    Darwin) os="macos";;
    MINGW*|MSYS*|CYGWIN*) os="windows";;
    *) [ "${OS:-}" = "Windows_NT" ] && os="windows" || os="$(uname -s)";;
  esac

  case "$(uname -m)" in
    x86_64|amd64) arch="x64";;
    arm64|aarch64) arch="arm64";;
    *) arch="$(uname -m)";;
  esac

  if [ "$os" = "windows" ]; then
    echo "windows-$arch"
  else
    echo "$os-$arch"
  fi
}

usage() {
  sed -n '2,13p' "$0"
}

main() {
  mkdir -p "$BIN/yt-dlp" "$BIN/ffmpeg"

  if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    usage
    exit 0
  fi

  if [ "${1:-}" = "--all" ]; then
    for key in linux-x64 macos-x64 macos-arm64 windows-x64; do
      fetch_platform "$key"
    done
    info "全部平台下载完成。"
    exit 0
  fi

  local key
  key="$(detect_platform)"
  case "$key" in
    linux-x64|macos-x64|macos-arm64|windows-x64) ;;
    *) die "无法识别的当前平台：$key（可用 --all 下载全部平台）";;
  esac
  fetch_platform "$key"
  info "完成。"
}

main "$@"

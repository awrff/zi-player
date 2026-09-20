#!/usr/bin/env bash
#
# fetch-binaries.sh — 下载 Tauri sidecar 二进制（yt-dlp + ffmpeg）
#
# 这些二进制体积较大，不入 git（见 .gitignore 的 src-tauri/binaries/）。
# 全新 clone 后运行本脚本即可按平台下载并放到 Tauri `externalBin` 期望的路径：
#   src-tauri/binaries/{yt-dlp,ffmpeg}/<name>-<target-triple>[.exe]
#
# 用法：
#   bash scripts/fetch-binaries.sh            # 下载当前平台
#   bash scripts/fetch-binaries.sh --all      # 下载全部 4 个平台（跨平台打包用）
#   bash scripts/fetch-binaries.sh --check    # 检查当前平台二进制是否已就位
#   bash scripts/fetch-binaries.sh --dump-layout  # 打印全部平台的期望相对路径
#   bash scripts/fetch-binaries.sh --help     # 帮助
#
# 依赖：curl（或 wget）；Linux 还需要 tar + xz；Windows/macOS 包需要 unzip。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$ROOT/src-tauri/binaries"

YTDLP_BASE="https://github.com/yt-dlp/yt-dlp/releases/latest/download"
FFMPEG_BTB_BASE="https://github.com/BtbN/FFmpeg-Builds/releases/latest/download"
FFMPEG_EVERMEET="https://evermeet.cx/ffmpeg/getrelease/zip"

# 每个平台各自一个工作目录，避免 --all 时 ffmpeg-* 通配符撞车。
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

info()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m!!\033[0m %s\n' "$*"; }
die()   { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

if command -v curl >/dev/null 2>&1; then
  download() { curl -fL --retry 3 --retry-delay 2 --connect-timeout 20 -o "$2" "$1"; }
elif command -v wget >/dev/null 2>&1; then
  download() { wget -O "$2" "$1"; }
else
  die "未找到 curl 或 wget，请先安装其一。"
fi

require() {
  command -v "$1" >/dev/null 2>&1 || die "缺少依赖：$1"
}

# 拒绝空文件和常见的 HTML/文本错误页，避免静默装进一个不能跑的 sidecar。
assert_payload() {
  local path="$1" kind="${2:-binary}"
  [ -s "$path" ] || die "下载结果为空：$path"
  local head
  head="$(head -c 64 "$path" 2>/dev/null || true)"
  case "$head" in
    '<!DOCTYPE'*|'<!doctype'*|'<html'*|'<HTML'*|'Not Found'*|'404'*)
      die "下载到的不是 $kind（像是错误页）：$path"
      ;;
  esac
}

platform_meta() {
  # stdout: triple<TAB>ytdlp_asset<TAB>ffmpeg_src
  case "$1" in
    linux-x64)
      printf '%s\t%s\t%s\n' "x86_64-unknown-linux-gnu" "yt-dlp_linux" "linux64"
      ;;
    macos-x64)
      printf '%s\t%s\t%s\n' "x86_64-apple-darwin" "yt-dlp_macos" "evermeet"
      ;;
    macos-arm64)
      printf '%s\t%s\t%s\n' "aarch64-apple-darwin" "yt-dlp_macos" "evermeet"
      ;;
    windows-x64)
      printf '%s\t%s\t%s\n' "x86_64-pc-windows-msvc" "yt-dlp.exe" "win64"
      ;;
    *) die "未知平台：$1";;
  esac
}

sidecar_relpath() {
  local key="$1" name="$2" triple exe=""
  triple="$(platform_meta "$key" | cut -f1)"
  [ "$key" = "windows-x64" ] && exe=".exe"
  printf 'binaries/%s/%s-%s%s\n' "$name" "$name" "$triple" "$exe"
}

all_keys() {
  printf '%s\n' linux-x64 macos-x64 macos-arm64 windows-x64
}

fetch_platform() {
  local key="$1" triple ytdlp_asset ffmpeg_src work
  IFS=$'\t' read -r triple ytdlp_asset ffmpeg_src < <(platform_meta "$key")
  work="$TMP/$key"
  mkdir -p "$work" "$BIN/yt-dlp" "$BIN/ffmpeg"

  info "下载 $key (triple: $triple)"

  local ytdlp_name ffmpeg_name
  ytdlp_name="$(basename "$(sidecar_relpath "$key" yt-dlp)")"
  ffmpeg_name="$(basename "$(sidecar_relpath "$key" ffmpeg)")"

  download "$YTDLP_BASE/$ytdlp_asset" "$work/yt-dlp"
  assert_payload "$work/yt-dlp" "yt-dlp"
  install -m 0755 "$work/yt-dlp" "$BIN/yt-dlp/$ytdlp_name"
  [ -s "$BIN/yt-dlp/$ytdlp_name" ] || die "安装失败：$BIN/yt-dlp/$ytdlp_name"
  info "  yt-dlp  → $BIN/yt-dlp/$ytdlp_name"

  case "$ffmpeg_src" in
    linux64)
      require tar
      require xz
      download "$FFMPEG_BTB_BASE/ffmpeg-master-latest-linux64-gpl.tar.xz" "$work/ffmpeg.tar.xz"
      assert_payload "$work/ffmpeg.tar.xz" "ffmpeg 压缩包"
      tar -xJf "$work/ffmpeg.tar.xz" -C "$work"
      local ffmpeg_bin
      ffmpeg_bin="$(echo "$work"/ffmpeg-*/bin/ffmpeg)"
      [ -f "$ffmpeg_bin" ] || die "压缩包里找不到 ffmpeg：$work"
      install -m 0755 "$ffmpeg_bin" "$BIN/ffmpeg/$ffmpeg_name"
      ;;
    win64)
      require unzip
      download "$FFMPEG_BTB_BASE/ffmpeg-master-latest-win64-gpl.zip" "$work/ffmpeg.zip"
      assert_payload "$work/ffmpeg.zip" "ffmpeg 压缩包"
      unzip -q "$work/ffmpeg.zip" -d "$work"
      local ffmpeg_exe
      ffmpeg_exe="$(echo "$work"/ffmpeg-*/bin/ffmpeg.exe)"
      [ -f "$ffmpeg_exe" ] || die "压缩包里找不到 ffmpeg.exe：$work"
      install -m 0755 "$ffmpeg_exe" "$BIN/ffmpeg/$ffmpeg_name"
      ;;
    evermeet)
      require unzip
      if [ "$key" = "macos-arm64" ]; then
        warn "evermeet.cx 只提供 x86_64 构建；macOS arm64 将下载 x86_64 版（需 Rosetta 2）"
      fi
      download "$FFMPEG_EVERMEET" "$work/ffmpeg-evermeet.zip"
      assert_payload "$work/ffmpeg-evermeet.zip" "ffmpeg 压缩包"
      mkdir -p "$work/evermeet"
      unzip -qo "$work/ffmpeg-evermeet.zip" -d "$work/evermeet"
      [ -f "$work/evermeet/ffmpeg" ] || die "evermeet 压缩包里找不到 ffmpeg"
      install -m 0755 "$work/evermeet/ffmpeg" "$BIN/ffmpeg/$ffmpeg_name"
      ;;
    *) die "未知 ffmpeg 来源：$ffmpeg_src";;
  esac
  [ -s "$BIN/ffmpeg/$ffmpeg_name" ] || die "安装失败：$BIN/ffmpeg/$ffmpeg_name"
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

  printf '%s-%s\n' "$os" "$arch"
}

check_platform() {
  local key="$1" rel path missing=0
  for name in yt-dlp ffmpeg; do
    rel="$(sidecar_relpath "$key" "$name")"
    path="$ROOT/src-tauri/$rel"
    if [ ! -s "$path" ]; then
      printf '✗ 缺少 %s\n' "$rel" >&2
      missing=1
    else
      printf '✓ %s (%s bytes)\n' "$rel" "$(wc -c < "$path" | tr -d ' ')"
    fi
  done
  if [ "$missing" -ne 0 ]; then
    die "当前平台 sidecar 不完整。运行：bash scripts/fetch-binaries.sh"
  fi
}

dump_layout() {
  local key
  for key in $(all_keys); do
    sidecar_relpath "$key" yt-dlp
    sidecar_relpath "$key" ffmpeg
  done
}

usage() {
  sed -n '2,16p' "$0"
}

main() {
  if [ "$#" -gt 1 ]; then
    die "多余参数：$*（见 --help）"
  fi

  case "${1:-}" in
    --help|-h)
      usage
      exit 0
      ;;
    --dump-layout)
      dump_layout
      exit 0
      ;;
    --check)
      local key
      key="$(detect_platform)"
      case "$key" in
        linux-x64|macos-x64|macos-arm64|windows-x64) ;;
        *) die "无法识别的当前平台：$key（可用 --all 下载全部平台）";;
      esac
      check_platform "$key"
      info "当前平台 sidecar 已就位。"
      exit 0
      ;;
    --all)
      local key
      for key in $(all_keys); do
        fetch_platform "$key"
      done
      info "全部平台下载完成。"
      exit 0
      ;;
    "")
      local key
      key="$(detect_platform)"
      case "$key" in
        linux-x64|macos-x64|macos-arm64|windows-x64) ;;
        *) die "无法识别的当前平台：$key（可用 --all 下载全部平台）";;
      esac
      fetch_platform "$key"
      info "完成。"
      exit 0
      ;;
    *)
      die "未知参数：$1（见 --help）"
      ;;
  esac
}

main "$@"

#!/usr/bin/env bash
#
# check-uninstall-cleanup.sh — safely test Debian postrm cache cleanup in temp homes.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POSTRM="$ROOT/src-tauri/linux/deb/postrm"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail() { printf '✗ %s\n' "$*" >&2; exit 1; }
pass() { printf '✓ %s\n' "$*"; }

sh -n "$POSTRM"
pass "postrm shell 语法有效"

HOME_A="$TMP/user a"
HOME_B="$TMP/user-b"
PASSWD="$TMP/passwd"
export ZI_PLAYER_PASSWD_FILE="$PASSWD"

fixture() {
  local home="$1"
  mkdir -p "$home/.local/share/com.jayden.zi-player/audio"
  mkdir -p "$home/.local/share/com.jayden.zi-player/covers"
  mkdir -p "$home/.local/share/com.jayden.zi-player/other"
  printf 'audio' > "$home/.local/share/com.jayden.zi-player/audio/song.ogg"
  printf 'cover' > "$home/.local/share/com.jayden.zi-player/covers/song.jpg"
  printf 'keep' > "$home/.local/share/com.jayden.zi-player/other/keep"
}

assert_cache_present() {
  local home="$1"
  [ -f "$home/.local/share/com.jayden.zi-player/audio/song.ogg" ] || fail "fixture 缺少音频"
  [ -f "$home/.local/share/com.jayden.zi-player/covers/song.jpg" ] || fail "fixture 缺少封面"
}

assert_cache_removed() {
  local home="$1"
  [ ! -e "$home/.local/share/com.jayden.zi-player/audio" ] || fail "$home 的 audio 未删除"
  [ ! -e "$home/.local/share/com.jayden.zi-player/covers" ] || fail "$home 的 covers 未删除"
  [ -f "$home/.local/share/com.jayden.zi-player/other/keep" ] || fail "$home 的其他数据被误删"
}

for home in "$HOME_A" "$HOME_B"; do
  fixture "$home"
done
printf 'a:x:1000:1000::%s:/bin/sh\n' "$HOME_A" > "$PASSWD"
printf 'b:x:1001:1001::%s:/bin/sh\n' "$HOME_B" >> "$PASSWD"

sh "$POSTRM" upgrade 1.0.0
assert_cache_present "$HOME_A"
assert_cache_present "$HOME_B"
pass "upgrade 保留所有用户缓存"

sh "$POSTRM" remove
assert_cache_removed "$HOME_A"
assert_cache_removed "$HOME_B"
pass "remove 删除所有用户音频和封面且保留其他数据"

fixture "$HOME_A"
sh "$POSTRM" purge
sh "$POSTRM" purge
assert_cache_removed "$HOME_A"
pass "purge 可重复执行"

printf '\n卸载缓存清理检查通过。\n'

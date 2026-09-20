#!/usr/bin/env bash
#
# check-sidecars.sh — 校验 sidecar 路径 / ACL / 文档与 fetch 脚本一致。
#
# 不下载二进制。退出码非 0 表示配置漂移（构建会找不到 sidecar 或运行时 ACL 拒跑）。
#
# 用法：
#   bash scripts/check-sidecars.sh           # 校验配置一致性
#   bash scripts/check-sidecars.sh --require # 再检查当前平台二进制是否已就位

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FETCH="$ROOT/scripts/fetch-binaries.sh"
CONF="$ROOT/src-tauri/tauri.conf.json"
CAPS="$ROOT/src-tauri/capabilities/default.json"
README="$ROOT/README.md"

fail() { printf '✗ %s\n' "$*" >&2; exit 1; }
pass() { printf '✓ %s\n' "$*"; }

# --- fetch-binaries.sh CLI ---
help_out="$("$FETCH" --help)"
printf '%s\n' "$help_out" | grep -q -- '--all' || fail "fetch-binaries.sh --help 未说明 --all"
printf '%s\n' "$help_out" | grep -q -- 'binaries/{yt-dlp,ffmpeg}' || fail "fetch-binaries.sh --help 未说明嵌套路径"
pass "fetch-binaries.sh --help 含 --all 与嵌套路径"

if "$FETCH" --not-a-real-flag >/dev/null 2>&1; then
  fail "未知参数应失败"
fi
pass "未知参数会失败"

# --- layout vs externalBin ---
mapfile -t layout < <("$FETCH" --dump-layout)
[ "${#layout[@]}" -ge 8 ] || fail "--dump-layout 条目过少：${#layout[@]}"

bins="$(python3 - "$CONF" <<'PY'
import json, sys
conf = json.load(open(sys.argv[1]))
for b in conf["bundle"]["externalBin"]:
    print(b)
PY
)"
[ -n "$bins" ] || fail "tauri.conf.json bundle.externalBin 为空"

while IFS= read -r bin; do
  case "$bin" in
    binaries/yt-dlp/yt-dlp|binaries/ffmpeg/ffmpeg) ;;
    *) fail "externalBin 非嵌套路径：$bin";;
  esac
  matched=0
  for path in "${layout[@]}"; do
    case "$path" in
      "$bin"-*) matched=1; break;;
    esac
  done
  [ "$matched" -eq 1 ] || fail "--dump-layout 没有匹配 $bin-<triple> 的条目"
done <<< "$bins"
pass "externalBin 与 --dump-layout 前缀一致"

# --- capabilities ACL ---
python3 - "$CAPS" <<'PY'
import json, sys
caps = json.load(open(sys.argv[1]))
want = {"binaries/yt-dlp/yt-dlp", "binaries/ffmpeg/ffmpeg"}
found = set()
for entry in caps.get("permissions", []):
    if not isinstance(entry, dict):
        continue
    if entry.get("identifier") != "shell:allow-execute":
        continue
    for allow in entry.get("allow") or []:
        if allow.get("sidecar") is True and allow.get("args") is True:
            found.add(allow.get("name"))
missing = want - found
if missing:
    sys.stderr.write("capabilities 缺少 sidecar ACL: %s\n" % ", ".join(sorted(missing)))
    sys.exit(1)
PY
pass "capabilities 声明 yt-dlp / ffmpeg sidecar execute + args"

# --- README ---
grep -q 'binaries/yt-dlp/yt-dlp-' "$README" || fail "README 未写嵌套 yt-dlp 路径"
grep -q 'binaries/ffmpeg/ffmpeg-' "$README" || fail "README 未写嵌套 ffmpeg 路径"
grep -q 'scripts/fetch-binaries.sh --all' "$README" || fail "README 未写 --all 用法"
grep -q 'webkit2gtk-4.1' "$README" || fail "README 未写 Linux webkit2gtk-4.1 依赖"
grep -q 'Node.js 22' "$README" || fail "README 未写 Node.js 22+"
# 旧的扁平路径不应再作为推荐放置位置
if grep -nE 'src-tauri/binaries/yt-dlp-x86_64|src-tauri/binaries/ffmpeg-x86_64' "$README" >/dev/null; then
  fail "README 仍在教扁平 sidecar 路径（应改为 binaries/<name>/<name>-<triple>）"
fi
pass "README 与真实布局 / 先决条件一致"

if [ "${1:-}" = "--require" ]; then
  "$FETCH" --check
  pass "当前平台 sidecar 已就位"
fi

printf '\nsidecar 配置检查通过。\n'

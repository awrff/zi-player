import { describe, expect, it } from "vitest";
import { SIDECAR_GUIDANCE, formatSidecarGuidance } from "./sidecarError";

describe("formatSidecarGuidance", () => {
  it("maps opaque native missing-file errors to Chinese fetch-binaries guidance", () => {
    const msg = formatSidecarGuidance("Error: No such file or directory (os error 2)");
    expect(msg).toBe(SIDECAR_GUIDANCE);
    expect(msg).toMatch(/fetch-binaries/);
    expect(msg).toMatch(/[\u4e00-\u9fff]/);
    expect(msg).not.toMatch(/os error|No such file/i);
  });

  it("strips parenthetical Tauri junk from an already-Chinese sidecar hint", () => {
    const raw =
      "无法启动 sidecar `ffmpeg`。请先运行 `bash scripts/fetch-binaries.sh` 后重新构建。（sidecar not found）";
    const msg = formatSidecarGuidance(raw);
    expect(msg).toBeTruthy();
    expect(msg).toMatch(/fetch-binaries/);
    expect(msg).toMatch(/[\u4e00-\u9fff]/);
    expect(msg).not.toMatch(/sidecar not found/i);
  });

  it("leaves unrelated host errors alone so import/play can keep their own copy", () => {
    expect(formatSidecarGuidance("HTTP Error 403: Forbidden")).toBeNull();
    expect(formatSidecarGuidance("音频转码失败：libvorbis 参数无效")).toBeNull();
    expect(
      formatSidecarGuidance("音频转码失败：No such file or directory。未生成可播放的 OGG"),
    ).toBeNull();
  });
});

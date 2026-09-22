import { describe, expect, it } from "vitest";
import { SIDECAR_GUIDANCE } from "./sidecarError";
import {
  IMPORT_ERROR_COPY,
  classifyImportError,
  importErrorMessage,
} from "./importError";

describe("classifyImportError", () => {
  it("maps network-like host errors to Chinese network copy", () => {
    const result = classifyImportError(
      new Error("ERROR: Unable to download webpage: <urlopen error [Errno 110] Connection timed out>"),
    );
    expect(result.reason).toBe("network");
    expect(result.detail).toBe(IMPORT_ERROR_COPY.network);
    expect(result.detail).toMatch(/[\u4e00-\u9fff]/);
    expect(result.detail).not.toBe("解析失败，请检查链接后重试");
  });

  it("maps invalid/unavailable video errors to Chinese unavailable copy", () => {
    const result = classifyImportError(
      new Error("ERROR: [BiliBili] BV1xx411c7mD: Unable to download webpage: HTTP Error 404: Not Found"),
    );
    expect(result.reason).toBe("unavailable");
    expect(result.detail).toBe(IMPORT_ERROR_COPY.unavailable);
    expect(result.detail).toMatch(/[\u4e00-\u9fff]/);
    expect(result.detail).not.toBe("解析失败，请检查链接后重试");
  });

  it("maps JSON parse and extractor failures to Chinese parse copy", () => {
    const json = classifyImportError(new Error("expected value at line 1 column 1"));
    expect(json.reason).toBe("parse-failed");
    expect(json.detail).toBe(IMPORT_ERROR_COPY.parseFailed);

    const extract = classifyImportError(
      new Error("ERROR: [BiliBili] BV1xx411c7mD: Unable to extract initial state"),
    );
    expect(extract.reason).toBe("parse-failed");
    expect(extract.detail).toBe(IMPORT_ERROR_COPY.parseFailed);
    expect(extract.detail).not.toMatch(/链接可能无效/);
  });

  it("maps 风控/403/412 to Chinese access copy, not invalid-link copy", () => {
    const result = classifyImportError(
      new Error("ERROR: [BiliBili] BV1xx411c7mD: Unable to download webpage: HTTP Error 412: Precondition Failed"),
    );
    expect(result.reason).toBe("access");
    expect(result.detail).toBe(IMPORT_ERROR_COPY.access);
    expect(result.detail).toMatch(/[\u4e00-\u9fff]/);
    expect(result.detail).not.toMatch(/链接可能无效/);
  });

  it("keeps sidecar missing as resolve-failed with fetch-binaries guidance", () => {
    const result = classifyImportError(new Error("Error: No such file or directory (os error 2)"));
    expect(result.reason).toBe("resolve-failed");
    expect(result.detail).toBe(SIDECAR_GUIDANCE);
  });
});

describe("importErrorMessage", () => {
  it("surfaces typed Chinese detail instead of swallowing into 解析失败", () => {
    expect(
      importErrorMessage({
        ok: false,
        reason: "network",
        detail: IMPORT_ERROR_COPY.network,
      }),
    ).toBe(IMPORT_ERROR_COPY.network);

    expect(
      importErrorMessage({
        ok: false,
        reason: "unavailable",
        detail: IMPORT_ERROR_COPY.unavailable,
      }),
    ).toBe(IMPORT_ERROR_COPY.unavailable);

    expect(importErrorMessage({ ok: false, reason: "unsupported-url" })).toMatch(/B 站/);
    expect(importErrorMessage({ ok: false, reason: "resolve-failed" })).toMatch(/[\u4e00-\u9fff]/);
  });
});

describe("duplicate import copy", () => {
  it("tells the user the video is already on the board", () => {
    expect(importErrorMessage({ ok: false, reason: "duplicate" })).toBe("该视频已在看板上，无需重复添加");
  });

  it("uses the same board copy for clipboard imports", () => {
    expect(importErrorMessage({ ok: false, reason: "duplicate" }, "clipboard")).toBe(
      "该视频已在看板上，无需重复添加",
    );
  });
});

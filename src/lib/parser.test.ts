import { describe, expect, it } from "vitest";
import {
  extractBiliId,
  findBiliUrlInText,
  isBilibiliUrl,
  looksLikeUrl,
  normalizeBiliUrl,
} from "./parser";

describe("isBilibiliUrl", () => {
  it("accepts bilibili.com BV links", () => {
    expect(isBilibiliUrl("https://www.bilibili.com/video/BV1xx411c7mD")).toBe(true);
  });

  it("accepts bilibili.com av links", () => {
    expect(isBilibiliUrl("https://www.bilibili.com/video/av170001")).toBe(true);
  });

  it("accepts links with query strings", () => {
    expect(isBilibiliUrl("https://www.bilibili.com/video/BV1xx411c7mD?p=2&t=30")).toBe(true);
  });

  it("accepts b23.tv short links", () => {
    expect(isBilibiliUrl("https://b23.tv/AbCdEf")).toBe(true);
  });

  it("rejects non-bilibili URLs", () => {
    expect(isBilibiliUrl("https://www.youtube.com/watch?v=abc")).toBe(false);
    expect(isBilibiliUrl("https://www.bilibili.com/read/cv123")).toBe(false);
  });

  it("rejects non-URL text", () => {
    expect(isBilibiliUrl("hello world")).toBe(false);
    expect(isBilibiliUrl("")).toBe(false);
  });
});

describe("extractBiliId", () => {
  it("extracts the BV id", () => {
    expect(extractBiliId("https://www.bilibili.com/video/BV1xx411c7mD")).toBe("BV1xx411c7mD");
  });

  it("extracts the av id", () => {
    expect(extractBiliId("https://www.bilibili.com/video/av170001?t=10")).toBe("av170001");
  });

  it("returns the short code for b23.tv", () => {
    expect(extractBiliId("https://b23.tv/AbCdEf")).toBe("AbCdEf");
  });

  it("returns null for non-bilibili text", () => {
    expect(extractBiliId("nope")).toBeNull();
  });
});

describe("normalizeBiliUrl", () => {
  it("normalizes a full video URL", () => {
    expect(normalizeBiliUrl("https://www.bilibili.com/video/BV1xx411c7mD?p=3")).toBe(
      "https://www.bilibili.com/video/BV1xx411c7mD",
    );
  });

  it("returns null for non-bilibili URLs", () => {
    expect(normalizeBiliUrl("https://example.com/x")).toBeNull();
  });
});

describe("looksLikeUrl", () => {
  it("detects http(s) URLs", () => {
    expect(looksLikeUrl("https://example.com")).toBe(true);
    expect(looksLikeUrl("http://example.com/a?b=1")).toBe(true);
  });

  it("rejects plain text", () => {
    expect(looksLikeUrl("not a url")).toBe(false);
  });
});

describe("findBiliUrlInText", () => {
  it("finds a bilibili URL embedded in text", () => {
    const text = "看这个 https://www.bilibili.com/video/BV1xx411c7mD 很赞";
    expect(findBiliUrlInText(text)).toBe("https://www.bilibili.com/video/BV1xx411c7mD");
  });

  it("strips trailing punctuation", () => {
    const text = "链接：https://b23.tv/AbCdEf。";
    expect(findBiliUrlInText(text)).toBe("https://b23.tv/AbCdEf");
  });

  it("ignores non-bilibili URLs in text", () => {
    expect(findBiliUrlInText("see https://example.com and more")).toBeNull();
  });
});

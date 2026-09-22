import { describe, expect, it } from "vitest";
import {
  extractVideoId,
  findVideoUrlInText,
  isVideoUrl,
  looksLikeUrl,
  normalizeVideoUrl,
} from "./parser";

describe("isVideoUrl", () => {
  it("accepts video page BV links", () => {
    expect(isVideoUrl("https://www.bilibili.com/video/BV1xx411c7mD")).toBe(true);
  });

  it("accepts video page av links", () => {
    expect(isVideoUrl("https://www.bilibili.com/video/av170001")).toBe(true);
  });

  it("accepts links with query strings", () => {
    expect(isVideoUrl("https://www.bilibili.com/video/BV1xx411c7mD?p=2&t=30")).toBe(true);
  });

  it("accepts b23.tv short links", () => {
    expect(isVideoUrl("https://b23.tv/AbCdEf")).toBe(true);
  });

  it("rejects unsupported URLs", () => {
    expect(isVideoUrl("https://www.youtube.com/watch?v=abc")).toBe(false);
    expect(isVideoUrl("https://www.bilibili.com/read/cv123")).toBe(false);
  });

  it("rejects non-URL text", () => {
    expect(isVideoUrl("hello world")).toBe(false);
    expect(isVideoUrl("")).toBe(false);
  });
});

describe("extractVideoId", () => {
  it("extracts the BV id", () => {
    expect(extractVideoId("https://www.bilibili.com/video/BV1xx411c7mD")).toBe("BV1xx411c7mD");
  });

  it("extracts the av id", () => {
    expect(extractVideoId("https://www.bilibili.com/video/av170001?t=10")).toBe("av170001");
  });

  it("returns the short code for b23.tv", () => {
    expect(extractVideoId("https://b23.tv/AbCdEf")).toBe("AbCdEf");
  });

  it("returns null for unsupported text", () => {
    expect(extractVideoId("nope")).toBeNull();
  });
});

describe("normalizeVideoUrl", () => {
  it("normalizes a full video URL", () => {
    expect(normalizeVideoUrl("https://www.bilibili.com/video/BV1xx411c7mD?p=3")).toBe(
      "https://www.bilibili.com/video/BV1xx411c7mD",
    );
  });

  it("returns null for unsupported URLs", () => {
    expect(normalizeVideoUrl("https://example.com/x")).toBeNull();
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

describe("findVideoUrlInText", () => {
  it("finds a video URL embedded in text", () => {
    const text = "看这个 https://www.bilibili.com/video/BV1xx411c7mD 很赞";
    expect(findVideoUrlInText(text)).toBe("https://www.bilibili.com/video/BV1xx411c7mD");
  });

  it("strips trailing punctuation", () => {
    const text = "链接：https://b23.tv/AbCdEf。";
    expect(findVideoUrlInText(text)).toBe("https://b23.tv/AbCdEf");
  });

  it("ignores unsupported URLs in text", () => {
    expect(findVideoUrlInText("see https://example.com and more")).toBeNull();
  });
});

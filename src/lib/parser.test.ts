import { describe, expect, it } from "vitest";
import {
  extractVideoId,
  findVideoUrlInText,
  isSpaceListUrl,
  isVideoUrl,
  looksLikeUrl,
  normalizeVideoUrl,
  parseSpaceList,
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

describe("parseSpaceList", () => {
  it("parses a collectiondetail URL", () => {
    expect(parseSpaceList("https://space.bilibili.com/2142762/channel/collectiondetail?sid=57445&spm=x")).toEqual({
      kind: "collection",
      mid: "2142762",
      sid: "57445",
      url: "https://space.bilibili.com/2142762/channel/collectiondetail?sid=57445",
    });
  });

  it("parses a seriesdetail URL", () => {
    expect(parseSpaceList("https://space.bilibili.com/1958703906/channel/seriesdetail?sid=547718&ctype=0")?.kind).toBe(
      "series",
    );
  });

  it("rejects incomplete or unrelated URLs", () => {
    expect(parseSpaceList("https://space.bilibili.com/2142762/channel/collectiondetail")).toBeNull();
    expect(parseSpaceList("https://space.bilibili.com/2142762/channel/collectiondetail?sid=abc")).toBeNull();
    expect(parseSpaceList("https://space.bilibili.com/abc/channel/collectiondetail?sid=1")).toBeNull();
    expect(parseSpaceList("https://space.bilibili.com/2142762/uploads")).toBeNull();
    expect(parseSpaceList("https://www.bilibili.com/video/BV1xx411c7mD")).toBeNull();
  });

  it("isSpaceListUrl mirrors parseSpaceList", () => {
    expect(isSpaceListUrl("https://space.bilibili.com/2142762/channel/collectiondetail?sid=57445")).toBe(true);
    expect(isSpaceListUrl("https://www.bilibili.com/video/BV1xx411c7mD")).toBe(false);
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

  it("finds a space collection URL embedded in text", () => {
    const text = "合集：https://space.bilibili.com/2142762/channel/collectiondetail?sid=57445&spm=x 很赞";
    expect(findVideoUrlInText(text)).toBe("https://space.bilibili.com/2142762/channel/collectiondetail?sid=57445");
  });
});

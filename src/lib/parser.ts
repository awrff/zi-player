/**
 * Video URL parsing and validation.
 *
 * Supported forms:
 *  - https://www.bilibili.com/video/BV1xx411c7mD
 *  - https://www.bilibili.com/video/av170001
 *  - https://b23.tv/AbCdEf (short link)
 *  - with query strings / trailing junk: ?p=2&t=30, etc.
 */

const VIDEO_HOST = /(^|\.)bilibili\.com$/i;

/** Matches host/video/BV... or host/video/av... */
const VIDEO_PATH_RE = /^\/video\/(BV[0-9A-Za-z]{10}|av\d+)/i;

/** Matches a b23.tv short link. */
const SHORT_LINK_RE = /^\/[0-9A-Za-z]+$/;

export interface ParsedVideo {
  /** Canonical id: "BV1xx..." or "av123". */
  id: string;
  /** Canonical webpage URL. */
  url: string;
}

/** A space collection/series page (`space.bilibili.com/{mid}/channel/...`). */
export interface ParsedSpaceList {
  /** `"collection"` = collectiondetail, `"series"` = seriesdetail. */
  kind: "collection" | "series";
  mid: string;
  sid: string;
  /** Canonical space list URL. */
  url: string;
}

/** Normalize a URL object + return the video id if it is a supported video page. */
function parseVideoUrl(raw: string): ParsedVideo | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  // b23.tv short link -> redirect to the video page.
  if (url.hostname.toLowerCase() === "b23.tv" && SHORT_LINK_RE.test(url.pathname)) {
    return { id: url.pathname.slice(1), url: `https://b23.tv${url.pathname}` };
  }

  if (!VIDEO_HOST.test(url.hostname)) {
    return null;
  }

  const match = url.pathname.match(VIDEO_PATH_RE);
  if (!match) {
    return null;
  }

  const id = match[1];
  const canonical = `https://www.bilibili.com/video/${id}`;
  return { id, url: canonical };
}

/** True when the given text looks like any http(s) URL at all. */
export function looksLikeUrl(text: string): boolean {
  try {
    const url = new URL(text.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** True when the text is a supported video URL (video page or b23.tv short link). */
export function isVideoUrl(text: string): boolean {
  return parseVideoUrl(text) !== null;
}

/** Extract the canonical video id (e.g. "BV1xx411c7mD") or null. */
export function extractVideoId(text: string): string | null {
  return parseVideoUrl(text)?.id ?? null;
}

/** Extract a normalized video URL, or null when not recognized. */
export function normalizeVideoUrl(text: string): string | null {
  return parseVideoUrl(text)?.url ?? null;
}

/** Parse a space collection/series page URL, or null. */
export function parseSpaceList(text: string): ParsedSpaceList | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  if (url.hostname.toLowerCase() !== "space.bilibili.com") {
    return null;
  }
  const match = url.pathname.match(/^\/(\d+)\/channel\/(collectiondetail|seriesdetail)\/?$/i);
  if (!match) {
    return null;
  }
  const sid = url.searchParams.get("sid");
  if (!sid || !/^\d+$/.test(sid)) {
    return null;
  }
  const page = match[2].toLowerCase();
  return {
    kind: page === "seriesdetail" ? "series" : "collection",
    mid: match[1],
    sid,
    url: `https://space.bilibili.com/${match[1]}/channel/${page}?sid=${sid}`,
  };
}

/** True when the text is a space collection/series URL. */
export function isSpaceListUrl(text: string): boolean {
  return parseSpaceList(text) !== null;
}

/** Find the first supported video or space-list URL embedded in a text block. */
export function findVideoUrlInText(text: string): string | null {
  const candidate = text.match(/https?:\/\/[^\s"'<>，。！？【】（）]+/gi);
  if (!candidate) return null;

  for (const raw of candidate) {
    const cleaned = raw.replace(/[),.;:!?]+$/, "");
    if (isVideoUrl(cleaned)) {
      return normalizeVideoUrl(cleaned);
    }
    if (isSpaceListUrl(cleaned)) {
      return parseSpaceList(cleaned)?.url ?? null;
    }
  }
  return null;
}

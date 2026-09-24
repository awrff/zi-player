/** Metadata resolved for a video. */
export interface VideoMeta {
  /** Video id, e.g. "BV1xx411c7mD" (used as the stable key). */
  id: string;
  /** Normalized webpage URL. */
  url: string;
  /** Video title. */
  title: string;
  /** Uploader / author name. */
  uploader: string;
  /** Duration in seconds. */
  duration: number;
  /** Cover (thumbnail) image URL. */
  cover: string;
}

export type ImportStatus = "queued" | "resolving" | "transcoding" | "ready" | "failed";

/** A video item stored on the board. */
export interface VideoItem extends VideoMeta {
  /** Unix epoch ms when the item was added. */
  addedAt: number;
  /** Local audio source URL (set after the audio stream has been cached). */
  cachePath?: string;
  importStatus?: ImportStatus;
  importProgress?: number;
  importError?: string;
}

/** A named, ordered list of library video ids. */
export interface Playlist {
  id: string;
  name: string;
  songIds: string[];
  createdAt: number;
  updatedAt: number;
}

/** `"all"` is the full library; any other value is a playlist id. */
export type LibrarySelection = "all" | string;

export type BoardViewMode = "grid" | "list";

/** Spotify-style repeat: off, entire queue, or the current track. */
export type RepeatMode = "off" | "all" | "one";

export type ImportFailReason =
  | "not-a-url"
  | "unsupported-url"
  | "duplicate"
  | "network"
  | "unavailable"
  | "access"
  | "parse-failed"
  | "resolve-failed";

/** Real import progress pushed from the Rust host (`import-progress` event). */
export interface ImportProgressEvent {
  /** Id of the import job the sidecar is working on. */
  id: string;
  stage: "download" | "transcode";
  /** Display-space percent; omitted when unknown (e.g. unknown duration). */
  percent?: number | null;
}

/** One selectable episode of a probed collection (选集). */
export interface CollectionEpisode {
  /** 1-based position within the probe (equals `page` for multi-P). */
  index: number;
  /** BV id of the episode (the parent video's BV for multi-P pages). */
  bvid: string;
  /** 1-based page number; only present for multi-P episodes. */
  page?: number | null;
  title: string;
  /** Duration in seconds (0 when unknown). */
  duration: number;
}

/** Result of probing a URL for collection info (`probe_video_collection`). */
export interface CollectionProbe {
  /** `"single"` (import as-is), `"multi_p"` (video's own 分P), `"list"` (合集/系列). */
  kind: "single" | "multi_p" | "list";
  title: string;
  episodes: CollectionEpisode[];
}

/** Result of importing a URL into the board. */
export type ImportResult =
  | { ok: true; item: VideoItem }
  | { ok: false; reason: ImportFailReason; detail?: string };

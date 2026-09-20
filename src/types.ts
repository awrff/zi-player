/** Metadata resolved for a Bilibili video. */
export interface VideoMeta {
  /** Bilibili video id, e.g. "BV1xx411c7mD" (used as the stable key). */
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

/** A video item stored on the board. */
export interface VideoItem extends VideoMeta {
  /** Unix epoch ms when the item was added. */
  addedAt: number;
  /** Local audio source URL (set after the audio stream has been cached). */
  cachePath?: string;
}

/** Result of importing a URL into the board. */
export type ImportResult =
  | { ok: true; item: VideoItem }
  | { ok: false; reason: "not-a-url" | "not-bilibili" | "duplicate" | "resolve-failed"; detail?: string };

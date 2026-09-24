import type { CollectionProbe, ImportProgressEvent, VideoMeta } from "@/types";
import { mockNative } from "./native.mock";
import { realNative } from "./native.real";

/**
 * Abstraction over every host capability (Tauri commands, plugins, window).
 *
 * The whole frontend depends only on this interface, which makes it fully
 * testable without the Rust host: unit tests mock the module and Playwright
 * runs a `vite --mode mock` build that selects {@link mockNative}.
 */
export interface Native {
  readonly isTauri: boolean;

  /** Resolve video metadata (title / cover / duration ...) for a video URL. */
  resolveVideo(url: string): Promise<VideoMeta>;

  /**
   * Probe a Bilibili URL for 选集 info (multi-P pages, ugc_season collections,
   * space collection/series lists). Rejects with a user-facing message when
   * the probe fails; callers then import the URL as a single video.
   */
  probeVideoCollection(url: string): Promise<CollectionProbe>;

  /**
   * Download the best-audio stream locally, transcode it, and return the
   * cached file's absolute path. `durationSecs` (when known) only feeds the
   * transcode progress mapping.
   */
  downloadAudio(id: string, url: string, durationSecs?: number): Promise<string>;

  /** Return a playable `http://127.0.0.1:<port>/...` URL for a cached audio file. */
  audioUrl(path: string): Promise<string>;

  /** Download the cover thumbnail locally and return an asset source URL. */
  fetchCover(id: string, url: string): Promise<string>;

  /** Names of missing sidecars (`yt-dlp` / `ffmpeg`). Empty when both can launch. */
  checkSidecars(): Promise<string[]>;

  /** Kill the sidecar processes registered for an in-flight import. */
  cancelImport(id: string): Promise<void>;

  /** Subscribe to real import progress events; returns an unsubscribe function. */
  onImportProgress(cb: (progress: ImportProgressEvent) => void): () => void;

  /** Read the current system clipboard as text. */
  readClipboard(): Promise<string>;

  /** Hide the window (used for the close-to-tray behaviour). */
  hideWindow(): Promise<void>;

  /** Subscribe to window show/focus events; returns an unsubscribe function. */
  onWindowShow(cb: () => void): () => void;

  checkUpdate(): Promise<AppUpdate | null>;
  installUpdate(): Promise<void>;
  relaunch(): Promise<void>;
}

export interface AppUpdate {
  version: string;
  notes: string;
}

const useMock = import.meta.env.VITE_MOCK_TAURI === "1";

export const native: Native = useMock ? mockNative : realNative;

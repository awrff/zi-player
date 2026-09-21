import type { VideoMeta } from "@/types";
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

  /** Resolve video metadata (title / cover / duration ...) for a Bilibili URL. */
  resolveVideo(url: string): Promise<VideoMeta>;

  /** Download the best-audio stream locally and return its absolute file path. */
  downloadAudio(id: string, url: string): Promise<string>;

  /** Return a playable `http://127.0.0.1:<port>/...` URL for a cached audio file. */
  audioUrl(path: string): Promise<string>;

  /** Download the cover thumbnail locally and return an asset source URL. */
  fetchCover(id: string, url: string): Promise<string>;

  /** Names of missing sidecars (`yt-dlp` / `ffmpeg`). Empty when both can launch. */
  checkSidecars(): Promise<string[]>;

  /** Read the current system clipboard as text. */
  readClipboard(): Promise<string>;

  /** Hide the window (used for the close-to-tray behaviour). */
  hideWindow(): Promise<void>;

  /** Subscribe to window show/focus events; returns an unsubscribe function. */
  onWindowShow(cb: () => void): () => void;
}

const useMock = import.meta.env.VITE_MOCK_TAURI === "1";

export const native: Native = useMock ? mockNative : realNative;

import type { Native } from "./native";
import type { VideoMeta } from "@/types";
import { extractBiliId } from "./parser";
import { silentWavDataUri } from "./silentWav";

/** Control surface exposed to Playwright via `window.__nativeMock`. */
export interface NativeMockControls {
  clipboard: string;
  hidden: boolean;
  showHandler: (() => void) | null;
  /** Fixture metadata keyed by video id; used by resolveVideo. */
  fixtures: Record<string, VideoMeta>;
  emitShow(): void;
  reset(): void;
}

declare global {
  interface Window {
    __nativeMock?: NativeMockControls;
    /** Set by Playwright before load to simulate a clipboard value on open. */
    __preSetClipboard?: string;
  }
}

function coverDataUri(id: string, hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320">
  <rect width="320" height="320" fill="hsl(${hue},70%,55%)"/>
  <text x="160" y="170" font-family="sans-serif" font-size="40" fill="white" text-anchor="middle">${id}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function makeFixture(id: string, index: number): VideoMeta {
  return {
    id,
    url: `https://www.bilibili.com/video/${id}`,
    title: `Sample video ${index}`,
    uploader: `Uploader ${index}`,
    duration: 180 + index * 37,
    cover: coverDataUri(id, index * 67),
  };
}

function ensureControls(): NativeMockControls {
  if (!window.__nativeMock) {
    const fixtures: Record<string, VideoMeta> = {};
    ["BV1xx411c7mD", "BV1xx411c7mE", "BV1xx411c7mF"].forEach((id, i) => {
      fixtures[id] = makeFixture(id, i + 1);
    });

    window.__nativeMock = {
      clipboard: window.__preSetClipboard ?? "",
      hidden: false,
      showHandler: null,
      fixtures,
      emitShow() {
        window.__nativeMock?.showHandler?.();
      },
      reset() {
        const controls = window.__nativeMock!;
        controls.clipboard = "";
        controls.hidden = false;
        controls.showHandler = null;
      },
    };
  }
  return window.__nativeMock;
}

export const mockNative: Native = {
  isTauri: false,

  async resolveVideo(url: string): Promise<VideoMeta> {
    const controls = ensureControls();
    const id = extractBiliId(url);
    if (!id) throw new Error(`Not a Bilibili URL: ${url}`);
    const fixture = controls.fixtures[id] ?? makeFixture(id, Object.keys(controls.fixtures).length + 1);
    // Small artificial delay so loading states are observable in tests.
    await new Promise((r) => setTimeout(r, 50));
    return fixture;
  },

  async downloadAudio(_id: string): Promise<string> {
    await new Promise((r) => setTimeout(r, 30));
    return silentWavDataUri();
  },

  async audioUrl(path: string): Promise<string> {
    // In mock mode there is no real audio to decode; pass the path through.
    return path;
  },

  async fetchCover(id: string): Promise<string> {
    await new Promise((r) => setTimeout(r, 20));
    return coverDataUri(id, 200);
  },

  async checkSidecars(): Promise<string[]> {
    return [];
  },

  async readClipboard(): Promise<string> {
    return ensureControls().clipboard;
  },

  async hideWindow(): Promise<void> {
    ensureControls().hidden = true;
  },

  onWindowShow(cb: () => void): () => void {
    ensureControls().showHandler = cb;
    return () => {
      if (window.__nativeMock) window.__nativeMock.showHandler = null;
    };
  },
};

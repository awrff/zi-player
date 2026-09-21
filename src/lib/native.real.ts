import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import type { Native } from "./native";
import type { VideoMeta } from "@/types";

export const realNative: Native = {
  isTauri: typeof window !== "undefined" && "__TAURI_INTERNALS__" in window,

  async resolveVideo(url: string): Promise<VideoMeta> {
    return invoke<VideoMeta>("resolve_video", { url });
  },

  async downloadAudio(id: string, url: string): Promise<string> {
    return invoke<string>("download_audio", { id, url });
  },

  async audioUrl(path: string): Promise<string> {
    // The Rust side resolves the loopback HTTP URL from the current server port.
    return invoke<string>("audio_url", { path });
  },

  async fetchCover(id: string, url: string): Promise<string> {
    const path = await invoke<string>("fetch_cover", { id, url });
    return convertFileSrc(path);
  },

  async checkSidecars(): Promise<string[]> {
    return invoke<string[]>("check_sidecars");
  },

  async readClipboard(): Promise<string> {
    try {
      return (await readText()) ?? "";
    } catch {
      return "";
    }
  },

  async hideWindow(): Promise<void> {
    await getCurrentWindow().hide();
  },

  onWindowShow(cb: () => void): () => void {
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) cb();
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  },
};

import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import type { Native } from "./native";
import type { CollectionProbe, ImportProgressEvent, VideoMeta } from "@/types";

let pendingUpdate: Update | null = null;

export const realNative: Native = {
  isTauri: typeof window !== "undefined" && "__TAURI_INTERNALS__" in window,

  async resolveVideo(url: string): Promise<VideoMeta> {
    return invoke<VideoMeta>("resolve_video", { url });
  },

  async probeVideoCollection(url: string): Promise<CollectionProbe> {
    return invoke<CollectionProbe>("probe_video_collection", { url });
  },

  async downloadAudio(id: string, url: string, durationSecs?: number): Promise<string> {
    return invoke<string>("download_audio", { id, url, durationSecs });
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

  async cancelImport(id: string): Promise<void> {
    await invoke("cancel_import", { id });
  },

  onImportProgress(cb: (progress: ImportProgressEvent) => void): () => void {
    const unlisten = listen<ImportProgressEvent>("import-progress", (event) => cb(event.payload));
    return () => {
      void unlisten.then((fn) => fn());
    };
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

  async checkUpdate() {
    try {
      const update = await check();
      pendingUpdate = update;
      if (!update) return null;
      return { version: update.version, notes: update.body ?? "" };
    } catch {
      pendingUpdate = null;
      return null;
    }
  },

  async installUpdate() {
    if (!pendingUpdate) return;
    await pendingUpdate.downloadAndInstall();
  },

  async relaunch() {
    await relaunch();
  },
};

import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import type { Native, TaskbarCommand, TaskbarTransport } from "./native";
import { loadReleaseNotes } from "./releaseNotes";
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

  async deleteSongCache(id: string): Promise<void> {
    return invoke("delete_song_cache", { id });
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

  onTaskbarCommand(cb: (command: TaskbarCommand) => void): () => void {
    const unlisten = listen<TaskbarCommand>("taskbar-command", (event) => cb(event.payload));
    return () => {
      void unlisten.then((fn) => fn());
    };
  },

  async setTaskbarTransport(state: TaskbarTransport): Promise<void> {
    await invoke("set_taskbar_transport", {
      playing: state.playing,
      canPrev: state.canPrev,
      canNext: state.canNext,
    });
  },

  async checkUpdate() {
    try {
      const update = await check();
      pendingUpdate = update;
      if (!update) return null;
      const notes = await loadReleaseNotes(update.version, update.body ?? "");
      return { version: update.version, notes };
    } catch {
      pendingUpdate = null;
      return null;
    }
  },

  async downloadUpdate(onProgress?: (loaded: number, total: number | null) => void) {
    if (!pendingUpdate) return;
    let loaded = 0;
    let total: number | null = null;
    await pendingUpdate.download((event) => {
      if (!onProgress) return;
      if (event.event === "Started") {
        const size = event.data.contentLength;
        total = size && size > 0 ? size : null;
        onProgress(0, total);
        return;
      }
      if (event.event === "Progress") {
        loaded += event.data.chunkLength;
        onProgress(loaded, total);
        return;
      }
      const complete = total && total > 0 ? total : Math.max(loaded, 1);
      onProgress(complete, complete);
    });
  },

  async installDownloaded() {
    if (!pendingUpdate) return;
    await pendingUpdate.install();
  },

  async relaunch() {
    await relaunch();
  },
};

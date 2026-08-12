import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import type { Native } from "./native";
import type { VideoMeta } from "@/types";

export const realNative: Native = {
  isTauri: typeof window !== "undefined" && "__TAURI_INTERNALS__" in window,

  async resolveVideo(url: string): Promise<VideoMeta> {
    return invoke<VideoMeta>("resolve_video", { url });
  },

  async downloadAudio(id: string, url: string): Promise<string> {
    const path = await invoke<string>("download_audio", { id, url });
    return convertFileSrc(path);
  },

  async readClipboard(): Promise<string> {
    try {
      return (await readText()) ?? "";
    } catch {
      return "";
    }
  },

  async registerGlobalShortcut(shortcut: string, handler: () => void): Promise<() => void> {
    await register(shortcut, (event) => {
      if (event.state === "Pressed") handler();
    });
    return () => {
      void unregister(shortcut);
    };
  },

  async hideWindow(): Promise<void> {
    await getCurrentWindow().hide();
  },

  async showWindow(): Promise<void> {
    const win = getCurrentWindow();
    await win.show();
    await win.setFocus();
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

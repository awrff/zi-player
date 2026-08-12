import { useEffect } from "react";
import { native } from "@/lib/native";
import { extractBiliId, findBiliUrlInText } from "@/lib/parser";
import { useVideoStore } from "@/store/videoStore";

/**
 * Watches the clipboard for a Bilibili URL. Checks once on mount (app open)
 * and again every time the window is shown/focused (e.g. after the hotkey).
 */
export function useClipboardWatch(onDetect: (url: string) => void): void {
  useEffect(() => {
    let disposed = false;

    const check = async () => {
      try {
        const text = await native.readClipboard();
        if (disposed) return;
        const url = findBiliUrlInText(text);
        if (!url) return;
        const id = extractBiliId(url);
        if (id && !useVideoStore.getState().has(id)) {
          onDetect(url);
        }
      } catch {
        // Clipboard read failure is non-fatal.
      }
    };

    void check();
    const unlisten = native.onWindowShow(check);
    return () => {
      disposed = true;
      unlisten();
    };
  }, [onDetect]);
}

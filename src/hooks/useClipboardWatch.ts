import { useEffect, useRef } from "react";
import { native } from "@/lib/native";
import { extractVideoId, findVideoUrlInText } from "@/lib/parser";
import { useVideoStore } from "@/store/videoStore";

/**
 * Watches the clipboard for a video URL. Checks once on mount (app open)
 * and again every time the window is shown/focused.
 */
export function useClipboardWatch(onDetect: (url: string) => void): void {
  // A URL is only offered once per app session, even if the window is shown
  // repeatedly while that same link is still on the clipboard.
  const promptedUrls = useRef(new Set<string>());

  useEffect(() => {
    let disposed = false;

    const check = async () => {
      try {
        const text = await native.readClipboard();
        if (disposed) return;
        const url = findVideoUrlInText(text);
        if (!url || promptedUrls.current.has(url)) return;
        const id = extractVideoId(url);
        if (id && !useVideoStore.getState().has(id)) {
          promptedUrls.current.add(url);
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

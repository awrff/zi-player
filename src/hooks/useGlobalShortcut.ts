import { useEffect } from "react";
import { native } from "@/lib/native";

/** Default global hotkey that summons the app from anywhere. */
export const DEFAULT_SHORTCUT = "CommandOrControl+Alt+B";

export function useGlobalShortcut(): void {
  useEffect(() => {
    let unregister: (() => void) | undefined;
    native
      .registerGlobalShortcut(DEFAULT_SHORTCUT, () => {
        void native.showWindow();
      })
      .then((fn) => {
        unregister = fn;
      })
      .catch(() => {
        // Hotkey registration may fail (e.g. already taken); not fatal.
      });

    return () => unregister?.();
  }, []);
}

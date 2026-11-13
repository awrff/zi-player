import { useCallback, useEffect, useRef, useState } from "react";
import { App as AntApp, Checkbox } from "antd";
import { ReleaseNotes } from "@/components/ReleaseNotes";
import { native, type AppUpdate } from "@/lib/native";

export type UpdateDownload = { percent: number | null };

const SKIP_KEY = "zi-player-skip-update";
const FALLBACK = "下载并安装更新？安装完成后应用会重启。";

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return String(error);
}

function skippedVersion(): string | null {
  try {
    return localStorage.getItem(SKIP_KEY);
  } catch {
    return null;
  }
}

function downloadPercent(loaded: number, total: number | null): number | null {
  if (total == null || total <= 0) return null;
  return Math.min(100, Math.round((loaded / total) * 100));
}

function UpdateConfirmBody({ notes, version }: { notes: string; version: string }) {
  return (
    <div className="update-dialog">
      <div className="update-notes-scroll">
        <ReleaseNotes text={notes} />
      </div>
      <Checkbox
        className="update-skip"
        defaultChecked={skippedVersion() === version}
        onChange={(event) => rememberSkip(version, event.target.checked)}
      >
        此版本不再提示
      </Checkbox>
    </div>
  );
}

function rememberSkip(version: string, skip: boolean): void {
  try {
    if (skip) localStorage.setItem(SKIP_KEY, version);
    else if (localStorage.getItem(SKIP_KEY) === version) localStorage.removeItem(SKIP_KEY);
  } catch {
    // Private mode can reject storage; the dialog still closes.
  }
}

export function useAppUpdater(): {
  update: AppUpdate | null;
  download: UpdateDownload | null;
  openDialog: (update: AppUpdate) => void;
} {
  const { modal } = AntApp.useApp();
  const [update, setUpdate] = useState<AppUpdate | null>(null);
  const [download, setDownload] = useState<{ loaded: number; total: number | null } | null>(null);
  const readyRef = useRef(false);
  const downloadingRef = useRef(false);

  const reportFailure = useCallback(
    (error: unknown) => {
      modal.error({
        title: "更新失败",
        content: `下载或安装更新时出错：${errorText(error)}`,
        okText: "知道了",
      });
    },
    [modal],
  );

  const promptInstall = useCallback(
    (current: AppUpdate) => {
      modal.confirm({
        title: `${current.version} 已下载`,
        content: "安装完成后应用会重启。",
        okText: "安装",
        cancelText: "稍后",
        onOk: async () => {
          try {
            await native.installDownloaded();
            await native.relaunch();
          } catch (error) {
            reportFailure(error);
          }
        },
      });
    },
    [modal, reportFailure],
  );

  const startDownload = useCallback(
    (current: AppUpdate) => {
      if (downloadingRef.current) return;
      downloadingRef.current = true;
      setDownload({ loaded: 0, total: null });
      void native
        .downloadUpdate((loaded, total) => setDownload({ loaded, total }))
        .then(() => {
          readyRef.current = true;
          setDownload(null);
          promptInstall(current);
        })
        .catch((error: unknown) => {
          setDownload(null);
          reportFailure(error);
        })
        .finally(() => {
          downloadingRef.current = false;
        });
    },
    [promptInstall, reportFailure],
  );

  const openDialog = useCallback(
    (current: AppUpdate) => {
      if (downloadingRef.current) return;
      if (readyRef.current) {
        promptInstall(current);
        return;
      }
      const notes = current.notes.trim();
      modal.confirm({
        title: `发现新版本 ${current.version}`,
        content: <UpdateConfirmBody notes={notes || FALLBACK} version={current.version} />,
        okText: "更新",
        cancelText: "稍后",
        onOk: () => {
          startDownload(current);
        },
      });
    },
    [modal, promptInstall, startDownload],
  );
  const openDialogRef = useRef(openDialog);
  openDialogRef.current = openDialog;

  // Startup check only. A fresh openDialog must not prompt again.
  useEffect(() => {
    let disposed = false;

    void native.checkUpdate().then((found) => {
      if (disposed || !found) return;
      setUpdate(found);
      if (skippedVersion() === found.version) return;
      openDialogRef.current(found);
    });

    return () => {
      disposed = true;
    };
  }, []);

  return {
    update,
    download: download ? { percent: downloadPercent(download.loaded, download.total) } : null,
    openDialog,
  };
}

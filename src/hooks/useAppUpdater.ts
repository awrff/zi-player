import { useEffect } from "react";
import { App as AntApp } from "antd";
import { native } from "@/lib/native";

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return String(error);
}

export function useAppUpdater(): void {
  const { modal } = AntApp.useApp();

  useEffect(() => {
    let disposed = false;

    void native.checkUpdate().then((update) => {
      if (disposed || !update) return;
      modal.confirm({
        title: `发现新版本 ${update.version}`,
        content: update.notes || "下载并安装更新？安装完成后应用会重启。",
        okText: "更新",
        cancelText: "稍后",
        onOk: async () => {
          try {
            await native.installUpdate();
            await native.relaunch();
          } catch (error) {
            modal.error({
              title: "更新失败",
              content: `下载或安装更新时出错：${errorText(error)}`,
              okText: "知道了",
            });
          }
        },
      });
    });

    return () => {
      disposed = true;
    };
  }, [modal]);
}

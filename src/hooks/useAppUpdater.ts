import { useEffect } from "react";
import { Modal } from "antd";
import { native } from "@/lib/native";

export function useAppUpdater(): void {
  useEffect(() => {
    let disposed = false;

    void native.checkUpdate().then((update) => {
      if (disposed || !update) return;
      Modal.confirm({
        title: `发现新版本 ${update.version}`,
        content: update.notes || "下载并安装更新？安装完成后应用会重启。",
        okText: "更新",
        cancelText: "稍后",
        onOk: async () => {
          await native.installUpdate();
          await native.relaunch();
        },
      });
    });

    return () => {
      disposed = true;
    };
  }, []);
}

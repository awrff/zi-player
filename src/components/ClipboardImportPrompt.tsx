import { useState } from "react";
import { App, Button, Modal, Typography } from "antd";
import { CopyOutlined, PlusOutlined } from "@ant-design/icons";
import { importVideo } from "@/lib/importer";
import { importErrorMessage } from "@/lib/importError";
import { native } from "@/lib/native";
import type { CollectionProbe } from "@/types";
import { EpisodePickerModal } from "./EpisodePickerModal";

interface ClipboardImportPromptProps {
  url: string | null;
  onClose: () => void;
}

/** Shown when a video (or collection) URL is detected in the clipboard on app
 * open/show. Collections open the episode picker; single videos import
 * directly, exactly like before. */
export function ClipboardImportPrompt({ url, onClose }: ClipboardImportPromptProps) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [probe, setProbe] = useState<CollectionProbe | null>(null);

  const doImport = async () => {
    if (!url) return;
    setLoading(true);

    let collection: CollectionProbe | null = null;
    let probeFailed = false;
    try {
      const probed = await native.probeVideoCollection(url);
      if (probed.kind !== "single") collection = probed;
    } catch {
      probeFailed = true;
    }

    if (collection) {
      setLoading(false);
      setProbe(collection);
      return;
    }

    const result = await importVideo(url);
    setLoading(false);

    if (result.ok) {
      if (probeFailed) message.warning("未能识别选集，已按单个视频导入");
      message.success("已开始从剪贴板导入");
    } else if (result.reason === "duplicate") {
      message.warning(importErrorMessage(result, "clipboard"));
    } else {
      message.error(importErrorMessage(result, "clipboard"));
    }
    onClose();
  };

  return (
    <>
      <Modal
        title="检测到剪贴板中的视频链接"
        open={url !== null}
        onCancel={onClose}
        footer={[
          <Button key="ignore" onClick={onClose}>
            忽略
          </Button>,
          <Button key="import" type="primary" icon={<PlusOutlined />} loading={loading} onClick={() => void doImport()}>
            导入
          </Button>,
        ]}
      >
        <Typography.Paragraph
          style={{ wordBreak: "break-all", color: "var(--text-dim)" }}
          copyable={{ icon: <CopyOutlined /> }}
        >
          {url}
        </Typography.Paragraph>
      </Modal>
      {probe && (
        <EpisodePickerModal
          open
          probe={probe}
          onClose={() => setProbe(null)}
          onEnqueued={() => {
            setProbe(null);
            onClose();
          }}
        />
      )}
    </>
  );
}

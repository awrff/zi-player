import { useState } from "react";
import { App, Button, Input, Modal, Space } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import { importVideo } from "@/lib/importer";
import { importErrorMessage } from "@/lib/importError";
import { native } from "@/lib/native";
import type { CollectionProbe } from "@/types";
import { EpisodePickerModal } from "./EpisodePickerModal";

interface AddVideoModalProps {
  open: boolean;
  onClose: () => void;
}

export function AddVideoModal({ open, onClose }: AddVideoModalProps) {
  const { message } = App.useApp();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [probe, setProbe] = useState<CollectionProbe | null>(null);

  const submit = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      message.error("请输入 B 站视频链接");
      return;
    }
    setLoading(true);

    // Probe first: collections open the episode picker, everything else
    // (including a failed probe) imports as a single video like before.
    let collection: CollectionProbe | null = null;
    let probeFailed = false;
    try {
      const probed = await native.probeVideoCollection(trimmed);
      if (probed.kind !== "single") collection = probed;
    } catch {
      probeFailed = true;
    }

    if (collection) {
      setLoading(false);
      setProbe(collection);
      return;
    }

    const result = await importVideo(trimmed);
    setLoading(false);

    if (result.ok) {
      if (probeFailed) message.warning("未能识别选集，已按单个视频导入");
      message.success("已开始导入");
      setUrl("");
      onClose();
    } else if (result.reason === "duplicate") {
      message.warning(importErrorMessage(result));
    } else {
      message.error(importErrorMessage(result));
    }
  };

  return (
    <>
      <Modal
        title="添加视频"
        open={open}
        onCancel={onClose}
        footer={[
          <Button key="cancel" onClick={onClose}>
            取消
          </Button>,
          <Button key="submit" type="primary" loading={loading} onClick={() => void submit()}>
            添加
          </Button>,
        ]}
      >
        <Space.Compact style={{ width: "100%" }}>
          <Input
            prefix={<LinkOutlined style={{ color: "var(--text-dim)" }} />}
            placeholder="粘贴 B 站链接，例如 https://www.bilibili.com/video/BV..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPressEnter={() => void submit()}
            allowClear
            aria-label="video-url-input"
          />
        </Space.Compact>
      </Modal>
      {probe && (
        <EpisodePickerModal
          open
          probe={probe}
          onClose={() => setProbe(null)}
          onEnqueued={() => {
            setUrl("");
            setProbe(null);
            onClose();
          }}
        />
      )}
    </>
  );
}

import { useState } from "react";
import { App, Button, Input, Modal, Space } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import { importVideo } from "@/lib/importer";
import { importErrorMessage } from "@/lib/importError";

interface AddVideoModalProps {
  open: boolean;
  onClose: () => void;
}

export function AddVideoModal({ open, onClose }: AddVideoModalProps) {
  const { message } = App.useApp();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!url.trim()) {
      message.error("请输入 B 站视频链接");
      return;
    }
    setLoading(true);
    const result = await importVideo(url);
    setLoading(false);

    if (result.ok) {
      message.success(`已添加「${result.item.title}」`);
      setUrl("");
      onClose();
    } else {
      message.error(importErrorMessage(result));
    }
  };

  return (
    <Modal
      title="添加视频"
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button key="submit" type="primary" loading={loading} onClick={() => void submit()}>
          解析并添加
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
  );
}

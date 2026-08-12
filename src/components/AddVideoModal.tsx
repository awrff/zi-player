import { useState } from "react";
import { App, Button, Input, Modal, Space } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import { importVideo } from "@/lib/importer";

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
      const reasons: Record<string, string> = {
        "not-a-url": "请输入 B 站视频链接",
        "not-bilibili": "请输入有效的 B 站视频链接（BV / av / b23.tv）",
        duplicate: "这条视频已经在唱片架上了",
        "resolve-failed": "解析失败，请检查链接后重试",
      };
      message.error(reasons[result.reason]);
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

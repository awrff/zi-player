import { useState } from "react";
import { App, Button, Modal, Typography } from "antd";
import { CopyOutlined, PlusOutlined } from "@ant-design/icons";
import { importVideo } from "@/lib/importer";

interface ClipboardImportPromptProps {
  url: string | null;
  onClose: () => void;
}

/** Shown when a Bilibili URL is detected in the clipboard on app open/show. */
export function ClipboardImportPrompt({ url, onClose }: ClipboardImportPromptProps) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  const doImport = async () => {
    if (!url) return;
    setLoading(true);
    const result = await importVideo(url);
    setLoading(false);

    if (result.ok) {
      message.success(`已从剪贴板导入「${result.item.title}」`);
    } else {
      const reasons: Record<string, string> = {
        "not-a-url": "剪贴板内容不是有效链接",
        "not-bilibili": "剪贴板内容不是 B 站视频链接",
        duplicate: "这条视频已经在唱片架上了",
        "resolve-failed": "解析失败，请检查链接后重试",
      };
      message.error(reasons[result.reason]);
    }
    onClose();
  };

  return (
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
  );
}

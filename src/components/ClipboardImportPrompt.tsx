import { useState } from "react";
import { App, Button, Modal, Typography } from "antd";
import { CopyOutlined, PlusOutlined } from "@ant-design/icons";
import { importVideo } from "@/lib/importer";
import { importErrorMessage } from "@/lib/importError";

interface ClipboardImportPromptProps {
  url: string | null;
  onClose: () => void;
}

/** Shown when a video URL is detected in the clipboard on app open/show. */
export function ClipboardImportPrompt({ url, onClose }: ClipboardImportPromptProps) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  const doImport = async () => {
    if (!url) return;
    setLoading(true);
    const result = await importVideo(url);
    setLoading(false);

    if (result.ok) {
      message.success("已开始从剪贴板导入");
    } else if (result.reason === "duplicate") {
      message.warning(importErrorMessage(result, "clipboard"));
    } else {
      message.error(importErrorMessage(result, "clipboard"));
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

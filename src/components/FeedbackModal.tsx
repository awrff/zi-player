import { useState } from "react";
import { App, Button, Input, Modal, Segmented } from "antd";
import { sendFeedback, type FeedbackKind } from "@/lib/telemetry";

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

export function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const { message } = App.useApp();
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [text, setText] = useState("");
  const [contact, setContact] = useState("");
  const [loading, setLoading] = useState(false);

  const close = () => {
    if (loading) return;
    onClose();
  };

  const submit = async () => {
    const messageText = text.trim();
    if (!messageText) {
      message.error("请填写反馈内容");
      return;
    }
    setLoading(true);
    try {
      await sendFeedback({
        storage: localStorage,
        version: __APP_VERSION__,
        ua: navigator.userAgent,
        kind,
        message: messageText,
        contact: contact.trim(),
      });
      message.success("已发送");
      setText("");
      setContact("");
      onClose();
    } catch {
      message.error("发送失败，请稍后再试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="反馈"
      open={open}
      onCancel={close}
      footer={[
        <Button key="cancel" onClick={close}>
          取消
        </Button>,
        <Button key="submit" type="primary" loading={loading} onClick={() => void submit()}>
          发送
        </Button>,
      ]}
    >
      <Segmented
        block
        className="feedback-kind"
        value={kind}
        onChange={(value) => setKind(value as FeedbackKind)}
        options={[
          { label: "Bug", value: "bug" },
          { label: "需求", value: "feature" },
        ]}
      />
      <Input.TextArea
        style={{ marginTop: 12 }}
        rows={4}
        maxLength={2000}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="描述问题或想要的功能"
        aria-label="feedback-message"
      />
      <Input
        style={{ marginTop: 12 }}
        value={contact}
        maxLength={200}
        onChange={(event) => setContact(event.target.value)}
        placeholder="联系方式（可选）"
        aria-label="feedback-contact"
      />
    </Modal>
  );
}

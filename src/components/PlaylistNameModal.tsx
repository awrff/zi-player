import { useEffect, useState } from "react";
import { Input, Modal } from "antd";

interface PlaylistNameModalProps {
  open: boolean;
  title: string;
  initialName: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

export function PlaylistNameModal({ open, title, initialName, onSubmit, onClose }: PlaylistNameModalProps) {
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  const commit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <Modal
      title={title}
      open={open}
      onOk={commit}
      onCancel={onClose}
      okText="保存"
      cancelText="取消"
      okButtonProps={{ disabled: !name.trim() }}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onPressEnter={commit}
        placeholder="歌单名称"
        aria-label="playlist-name-input"
        maxLength={40}
      />
    </Modal>
  );
}

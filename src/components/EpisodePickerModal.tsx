import { useMemo, useState } from "react";
import { App, Button, Checkbox, Input, Modal, Space, Typography } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { formatDuration } from "@/lib/format";
import { enqueueEpisodes } from "@/lib/importQueue";
import type { CollectionProbe } from "@/types";

interface EpisodePickerModalProps {
  open: boolean;
  probe: CollectionProbe;
  /** Called on cancel; on confirm it runs after the enqueue succeeded. */
  onClose: () => void;
  /** Called after a successful enqueue (before `onClose`). */
  onEnqueued?: (queued: number) => void;
}

/** Lets the user pick which episodes of a probed 选集 (multi-P pages or a
 * collection list) to import. Episodes come pre-selected. */
export function EpisodePickerModal({ open, probe, onClose, onEnqueued }: EpisodePickerModalProps) {
  const { message } = App.useApp();
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<number>>(() => new Set(probe.episodes.map((ep) => ep.index)));

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return probe.episodes;
    return probe.episodes.filter((ep) => ep.title.toLowerCase().includes(query));
  }, [filter, probe.episodes]);

  const toggle = (index: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(index);
      else next.delete(index);
      return next;
    });
  };

  const selectVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const ep of visible) next.add(ep.index);
      return next;
    });
  };

  const clearVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const ep of visible) next.delete(ep.index);
      return next;
    });
  };

  const confirm = () => {
    const chosen = probe.episodes.filter((ep) => selected.has(ep.index));
    if (chosen.length === 0) return;
    const { queued, skipped } = enqueueEpisodes(chosen);
    if (queued > 0) {
      message.success(skipped > 0 ? `已开始导入 ${queued} 个视频，跳过 ${skipped} 个已存在` : `已开始导入 ${queued} 个视频`);
    } else {
      message.warning("所选视频都已在看板上");
    }
    onEnqueued?.(queued);
    onClose();
  };

  return (
    <Modal
      title={probe.title || "选择要导入的视频"}
      open={open}
      onCancel={onClose}
      width={560}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button key="confirm" type="primary" disabled={selected.size === 0} onClick={confirm}>
          导入所选 {selected.size} 个
        </Button>,
      ]}
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
        共 {probe.episodes.length} 集，已全选。取消勾选或筛选后再导入。
      </Typography.Paragraph>
      <Space.Compact style={{ width: "100%", marginBottom: 12 }}>
        <Input
          prefix={<SearchOutlined style={{ color: "var(--text-dim)" }} />}
          placeholder="搜索选集标题"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          allowClear
          aria-label="episode-filter"
        />
        <Button onClick={selectVisible} disabled={visible.length === 0}>
          全选
        </Button>
        <Button onClick={clearVisible} disabled={visible.length === 0}>
          清空
        </Button>
      </Space.Compact>
      <div style={{ maxHeight: 380, overflowY: "auto" }}>
        {visible.map((ep) => (
          <div key={ep.index} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
            <Checkbox
              checked={selected.has(ep.index)}
              onChange={(e) => toggle(ep.index, e.target.checked)}
              style={{ flex: 1, minWidth: 0 }}
            >
              <span style={{ color: "var(--text-dim)", marginRight: 8 }}>{ep.index}</span>
              <span style={{ wordBreak: "break-all" }}>{ep.title}</span>
            </Checkbox>
            {ep.duration > 0 && (
              <Typography.Text type="secondary" style={{ flexShrink: 0 }}>
                {formatDuration(ep.duration)}
              </Typography.Text>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

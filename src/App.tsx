import { useCallback, useState } from "react";
import { App as AntApp, Button, ConfigProvider, Input, Tooltip } from "antd";
import { ClearOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { theme } from "@/styles/theme";
import { useVideoStore } from "@/store/videoStore";
import { usePlayer } from "@/hooks/usePlayer";
import { useClipboardWatch } from "@/hooks/useClipboardWatch";
import { useGlobalShortcut } from "@/hooks/useGlobalShortcut";
import { Board } from "@/components/Board";
import { PlayerBar } from "@/components/PlayerBar";
import { AddVideoModal } from "@/components/AddVideoModal";
import { ClipboardImportPrompt } from "@/components/ClipboardImportPrompt";
import "./styles/global.css";

function BoardApp() {
  const { message } = AntApp.useApp();
  const items = useVideoStore((s) => s.items);
  const currentId = useVideoStore((s) => s.currentId);
  const playing = useVideoStore((s) => s.playing);
  const removeVideo = useVideoStore((s) => s.removeVideo);
  const renameVideo = useVideoStore((s) => s.renameVideo);
  const clearAll = useVideoStore((s) => s.clearAll);

  const [addOpen, setAddOpen] = useState(false);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const onError = useCallback((msg: string) => message.error(msg), [message]);
  const controls = usePlayer(onError);

  useGlobalShortcut();
  useClipboardWatch(setClipUrl);

  const q = query.trim().toLowerCase();
  const visibleItems = q
    ? items.filter((i) => i.title.toLowerCase().includes(q) || i.uploader.toLowerCase().includes(q))
    : items;

  return (
    <div className="app-shell">
      <header className="app-toolbar">
        <h1 className="app-title">
          Bili<span className="accent">Board</span>
        </h1>
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: "var(--text-dim)" }} />}
          placeholder="搜索唱片"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: 220 }}
          aria-label="search-input"
        />
        <div className="toolbar-spacer" />
        <Tooltip title={`全局快捷键唤起应用（Ctrl+Alt+B），复制 B 站链接后打开应用即可自动导入`}>
          <span style={{ color: "var(--text-dim)", fontSize: 12 }}>Ctrl+Alt+B 唤起</span>
        </Tooltip>
        <Button
          icon={<ClearOutlined />}
          disabled={items.length === 0}
          onClick={() => clearAll()}
        >
          清空
        </Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
          添加
        </Button>
      </header>

      <Board
        items={visibleItems}
        playingId={currentId}
        playing={playing}
        onToggle={(item) => void controls.toggle(item)}
        onDelete={(item) => removeVideo(item.id)}
        onRename={renameVideo}
      />

      <PlayerBar controls={controls} onDelete={removeVideo} />

      <AddVideoModal open={addOpen} onClose={() => setAddOpen(false)} />
      <ClipboardImportPrompt url={clipUrl} onClose={() => setClipUrl(null)} />
    </div>
  );
}

export default function App() {
  return (
    <ConfigProvider theme={theme}>
      <AntApp>
        <BoardApp />
      </AntApp>
    </ConfigProvider>
  );
}

import { useCallback, useEffect, useState } from "react";
import { App as AntApp, Button, ConfigProvider, Input } from "antd";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { theme } from "@/styles/theme";
import { useVideoStore } from "@/store/videoStore";
import { usePlayer } from "@/hooks/usePlayer";
import { useClipboardWatch } from "@/hooks/useClipboardWatch";
import { Board } from "@/components/Board";
import { LibrarySidebar } from "@/components/LibrarySidebar";
import { PlayerBar } from "@/components/PlayerBar";
import { AddVideoModal } from "@/components/AddVideoModal";
import { ClipboardImportPrompt } from "@/components/ClipboardImportPrompt";
import { native } from "@/lib/native";
import { SIDECAR_GUIDANCE } from "@/lib/sidecarError";
import "./styles/global.css";

function BoardApp() {
  const { message } = AntApp.useApp();
  const items = useVideoStore((s) => s.items);
  const currentId = useVideoStore((s) => s.currentId);
  const playing = useVideoStore((s) => s.playing);
  const removeVideo = useVideoStore((s) => s.removeVideo);
  const renameVideo = useVideoStore((s) => s.renameVideo);

  const [addOpen, setAddOpen] = useState(false);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const onError = useCallback((msg: string) => message.error(msg), [message]);
  const controls = usePlayer(onError);

  useEffect(() => {
    void native
      .checkSidecars()
      .then((missing) => {
        if (missing.length > 0) message.error(SIDECAR_GUIDANCE);
      })
      .catch(() => {
        // ponytail: browser / old builds without the command should stay quiet
      });
  }, [message]);

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
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
          添加
        </Button>
      </header>

      <div className="app-body">
        <LibrarySidebar itemCount={items.length} />
        <div className="app-main">
          <div className="library-heading">
            <h2>全部唱片</h2>
            <span className="library-heading-meta">{visibleItems.length} 首</span>
          </div>
          <Board
            items={visibleItems}
            playingId={currentId}
            playing={playing}
            onToggle={(item) => void controls.toggle(item)}
            onDelete={(item) => removeVideo(item.id)}
            onRename={renameVideo}
          />
        </div>
      </div>

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

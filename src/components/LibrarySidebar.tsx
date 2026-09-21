interface LibrarySidebarProps {
  itemCount: number;
}

export function LibrarySidebar({ itemCount }: LibrarySidebarProps) {
  return (
    <aside className="library-sidebar" data-testid="library-sidebar">
      <div className="library-section">
        <p className="library-section-title">资料库</p>
        <button type="button" className="library-item is-active" data-testid="library-all">
          <span>全部唱片</span>
          <span className="library-item-count">{itemCount}</span>
        </button>
      </div>
      <div className="library-section">
        <p className="library-section-title">歌单</p>
        <button
          type="button"
          className="library-item"
          disabled
          title="即将支持"
          data-testid="library-new-playlist"
        >
          新建歌单
        </button>
      </div>
    </aside>
  );
}

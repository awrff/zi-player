import type { ReactNode } from "react";

function inline(text: string, key: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)]+)/g;
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));
    const id = `${key}-${index++}`;
    if (match[1]) nodes.push(<strong key={id}>{match[1]}</strong>);
    else {
      const href = match[3] ?? match[4];
      const label = match[2] ?? match[4];
      nodes.push(
        <a key={id} href={href} target="_blank" rel="noreferrer">
          {label}
        </a>,
      );
    }
    last = start + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Render the small markdown subset used in GitHub release notes. */
export function ReleaseNotes({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let items: string[] = [];

  const flushList = () => {
    if (items.length === 0) return;
    const list = items;
    items = [];
    blocks.push(
      <ul key={`ul-${blocks.length}`}>
        {list.map((item, index) => (
          <li key={index}>{inline(item, `li-${blocks.length}-${index}`)}</li>
        ))}
      </ul>,
    );
  };

  lines.forEach((line, index) => {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushList();
      const Tag = heading[1].length >= 3 ? "h3" : "h2";
      blocks.push(<Tag key={`h-${index}`}>{inline(heading[2], `h-${index}`)}</Tag>);
      return;
    }
    const item = /^[-*]\s+(.+)$/.exec(line);
    if (item) {
      items.push(item[1]);
      return;
    }
    if (!line.trim()) {
      flushList();
      return;
    }
    flushList();
    blocks.push(<p key={`p-${index}`}>{inline(line, `p-${index}`)}</p>);
  });
  flushList();

  return <div className="update-notes">{blocks}</div>;
}

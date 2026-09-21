import { CustomerServiceOutlined } from "@ant-design/icons";

interface PlaylistCoverProps {
  covers: string[];
  size?: number;
  className?: string;
}

export function PlaylistCover({ covers, size = 32, className }: PlaylistCoverProps) {
  const mosaic = covers.length >= 4;
  const classes = ["playlist-cover", mosaic ? "is-mosaic" : "", className].filter(Boolean).join(" ");
  const shown = mosaic ? covers.slice(0, 4) : covers.slice(0, 1);

  return (
    <div className={classes} style={{ width: size, height: size }} data-testid="playlist-cover" aria-hidden>
      {shown.length === 0 ? (
        <span className="playlist-cover-placeholder">
          <CustomerServiceOutlined />
        </span>
      ) : (
        shown.map((src, index) => <img key={`${src}-${index}`} src={src} alt="" />)
      )}
    </div>
  );
}

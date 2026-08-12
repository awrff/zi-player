interface VinylDiscProps {
  spinning: boolean;
  className?: string;
}

/** A vinyl record rendered with CSS: grooves + coloured centre label. */
export function VinylDisc({ spinning, className }: VinylDiscProps) {
  const classes = ["vinyl-disc", spinning ? "spinning" : "", className].filter(Boolean).join(" ");
  return (
    <div className={classes} data-testid="vinyl-disc" data-spinning={spinning || undefined}>
      <div className="vinyl-label" />
    </div>
  );
}

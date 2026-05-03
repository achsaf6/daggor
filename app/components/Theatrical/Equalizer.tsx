// Static "playing" indicator: a row of varied-height vertical bars in the
// brand amber. Used on soundboard clips. Deliberately not animated —
// Restrained motion direction. The bar pattern is fixed so the visual
// reads as "audio bar chart frozen in time", which is exactly what the
// theatrical mockup shows.
const PATTERN = [0.4, 0.65, 0.5, 0.85, 0.55, 0.95, 0.45, 0.8, 0.35, 0.7, 0.5, 0.9];

interface EqualizerProps {
  bars?: number;
  height?: number; // px
}

export const Equalizer = ({ bars = 12, height = 18 }: EqualizerProps) => {
  const slice = PATTERN.slice(0, bars);
  return (
    <span
      className="theatrical-eq"
      style={{ height: `${height}px` }}
      aria-hidden
    >
      {slice.map((h, i) => (
        <span key={i} style={{ height: `${Math.round(h * height)}px` }} />
      ))}
    </span>
  );
};

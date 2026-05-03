"use client";

interface GridSizeSliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export const GridSizeSlider = ({
  value,
  onChange,
  min = 0.01,
  max = 10.00,
  step = 0.01,
}: GridSizeSliderProps) => {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <label className="flex items-center justify-between text-xs mb-2">
        <span className="parchment-numeric" style={{ color: "var(--parchment-ink-muted)" }}>Grid size</span>
        <span className="parchment-numeric" style={{ color: "var(--brass-shadow)" }}>{value.toFixed(2)}×</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, var(--brass-deep) 0%, var(--brass-deep) ${pct}%, rgba(110, 83, 32, 0.18) ${pct}%, rgba(110, 83, 32, 0.18) 100%)`,
          accentColor: "var(--brass-deep)",
        }}
      />
      <div className="parchment-flavor flex justify-between mt-1" style={{ fontSize: "0.65rem", color: "var(--parchment-ink-muted)" }}>
        <span>Smaller</span>
        <span>Larger</span>
      </div>
    </div>
  );
};


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
        <span className="glass-numeric" style={{ color: "var(--glass-txt-muted)" }}>Grid size</span>
        <span className="glass-numeric" style={{ color: "var(--glass-accent-deep)" }}>{value.toFixed(2)}×</span>
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
          background: `linear-gradient(to right, var(--glass-accent) 0%, var(--glass-accent) ${pct}%, var(--glass-border) ${pct}%, var(--glass-border) 100%)`,
          accentColor: "var(--glass-accent)",
        }}
      />
      <div className="glass-muted flex justify-between mt-1" style={{ fontSize: "0.65rem", color: "var(--glass-txt-muted)" }}>
        <span>Smaller</span>
        <span>Larger</span>
      </div>
    </div>
  );
};


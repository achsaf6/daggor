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
  return (
    <div>
      <label className="block text-white text-sm font-medium mb-2">
        Grid Size: {value.toFixed(2)}x
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-white"
        style={{
          background: `linear-gradient(to right, white 0%, white ${((value - min) / (max - min)) * 100}%, rgba(255, 255, 255, 0.3) ${((value - min) / (max - min)) * 100}%, rgba(255, 255, 255, 0.3) 100%)`,
        }}
      />
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>Smaller</span>
        <span>Larger</span>
      </div>
    </div>
  );
};


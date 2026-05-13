"use client";

import { useState, useEffect, useMemo } from "react";
import { GridData } from "../../../utils/gridData";
import { computeGridLines } from "../../../utils/grid";

interface HorizontalSquaresInputProps {
  gridScale: number;
  onGridScaleChange: (value: number) => void;
  gridData: GridData;
}

export const HorizontalSquaresInput = ({
  gridScale,
  onGridScaleChange,
  gridData,
}: HorizontalSquaresInputProps) => {
  const { spacingX: avgVerticalSpacing } = useMemo(
    () => computeGridLines(gridData, 1.0), // gridScale=1 to get base spacing
    [gridData]
  );

  // Calculate number of horizontal squares
  const horizontalSquares = useMemo(() => {
    if (avgVerticalSpacing <= 0 || gridData.imageWidth <= 0) return 0;
    const scaledSpacing = avgVerticalSpacing * gridScale;
    return Math.round((gridData.imageWidth / scaledSpacing) * 10) / 10; // Round to 1 decimal
  }, [avgVerticalSpacing, gridData.imageWidth, gridScale]);

  // Local state for the input value
  const [inputValue, setInputValue] = useState<string>(horizontalSquares.toString());

  // Update input value when gridScale changes externally (e.g., from slider)
  useEffect(() => {
    setInputValue(horizontalSquares.toString());
  }, [horizontalSquares]);

  const handleHorizontalSquaresChange = (value: string) => {
    setInputValue(value);
  };

  const applyHorizontalSquaresChange = () => {
    const numValue = parseFloat(inputValue);
    if (!isNaN(numValue) && numValue > 0 && avgVerticalSpacing > 0 && gridData.imageWidth > 0) {
      const newGridScale = gridData.imageWidth / (avgVerticalSpacing * numValue);
      onGridScaleChange(newGridScale);
    } else {
      // Reset to current value if invalid
      setInputValue(horizontalSquares.toString());
    }
  };

  const handleInputBlur = () => {
    applyHorizontalSquaresChange();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyHorizontalSquaresChange();
      e.currentTarget.blur();
    }
  };

  return (
    <div className="mb-4">
      <label className="flex items-center justify-between text-xs mb-2">
        <span className="glass-numeric" style={{ color: "var(--glass-txt-muted)" }}>Horizontal squares</span>
      </label>
      <input
        type="number"
        min="0.1"
        step="0.1"
        value={inputValue}
        onChange={(e) => handleHorizontalSquaresChange(e.target.value)}
        onBlur={handleInputBlur}
        onKeyDown={handleInputKeyDown}
        className="glass-numeric w-full border px-3 py-2 text-sm focus:outline-none"
        style={{ borderColor: "var(--glass-accent)", color: "var(--glass-txt)", background: "rgba(255,255,255,0.04)" }}
        placeholder="0"
      />
      <div className="glass-muted mt-1.5" style={{ fontSize: "0.75rem", color: "var(--glass-txt-muted)" }}>
        Squares that fit across the map width
      </div>
    </div>
  );
};


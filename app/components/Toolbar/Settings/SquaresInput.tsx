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
      <label className="block text-white text-sm font-medium mb-2">
        Horizontal Squares
      </label>
      <input
        type="number"
        min="0.1"
        step="0.1"
        value={inputValue}
        onChange={(e) => handleHorizontalSquaresChange(e.target.value)}
        onBlur={handleInputBlur}
        onKeyDown={handleInputKeyDown}
        className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
        placeholder="Enter number of squares"
      />
      <div className="text-xs text-gray-400 mt-1">
        Number of grid squares that fit horizontally across the image
      </div>
    </div>
  );
};


"use client";

import { GridSizeSlider } from "./GridSizeSlider";
import { GridOffsetJoystick } from "./GridOffsetJoystick";

interface MapSettingsProps {
  gridScale: number;
  onGridScaleChange: (value: number) => void;
  gridOffsetX: number;
  gridOffsetY: number;
  onGridOffsetChange: (x: number, y: number) => void;
}

export const MapSettings = ({
  gridScale,
  onGridScaleChange,
  gridOffsetX,
  gridOffsetY,
  onGridOffsetChange,
}: MapSettingsProps) => {
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <h3 className="text-white text-sm font-semibold mb-4">Settings</h3>
      
      {/* Grid Size Slider */}
      <div className="mb-4">
        <GridSizeSlider
          value={gridScale}
          onChange={onGridScaleChange}
        />
      </div>

      {/* Grid Offset Joystick */}
      <div className="mb-4">
        <GridOffsetJoystick
          offsetX={gridOffsetX}
          offsetY={gridOffsetY}
          onChange={onGridOffsetChange}
        />
      </div>

      {/* Add more settings here in the future */}
    </div>
  );
};


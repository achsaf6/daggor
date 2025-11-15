"use client";

import { useState } from "react";
import { GridSizeSlider } from "./GridSizeSlider";
import { GridOffsetJoystick } from "./GridOffsetJoystick";
import { useBattlemap } from "../providers/BattlemapProvider";

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
  const {
    currentBattlemap,
    isMutating,
    isBattlemapLoading,
    deleteBattlemap,
  } = useBattlemap();

  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleDeleteBattlemap = async () => {
    if (!currentBattlemap) {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${currentBattlemap.name}" and all of its covers?`
    );
    if (!confirmed) {
      return;
    }

    setStatusMessage("Deleting battlemap…");
    await deleteBattlemap(currentBattlemap.id);
    setStatusMessage(null);
  };

  const disabled = isBattlemapLoading || isMutating;

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

      {/* Delete Battlemap */}
      {currentBattlemap ? (
        <div className="mb-4 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={handleDeleteBattlemap}
            disabled={disabled}
            className="w-full bg-red-900/40 hover:bg-red-900/60 border border-red-500/40 rounded-md px-2 py-2 text-white text-sm font-medium transition disabled:opacity-50"
          >
            Delete Battlemap
          </button>
          {statusMessage ? (
            <div className="text-xs text-white/50 mt-2">{statusMessage}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};


"use client";

import { useState } from "react";
import { GridSizeSlider } from "./GridSizeSlider";
import { GridOffsetJoystick } from "./GridOffsetJoystick";
import { HorizontalSquaresInput } from "./SquaresInput";
import { useBattlemap } from "../../../providers/BattlemapProvider";
import { GridData } from "../../../utils/gridData";

interface MapSettingsProps {
  gridScale: number;
  onGridScaleChange: (value: number) => void;
  gridOffsetX: number;
  gridOffsetY: number;
  onGridOffsetChange: (x: number, y: number) => void;
  gridData: GridData;
}

export const MapSettings = ({
  gridScale,
  onGridScaleChange,
  gridOffsetX,
  gridOffsetY,
  onGridOffsetChange,
  gridData,
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
      <h3 className="parchment-heading text-sm mb-1">Settings</h3>
      <div className="parchment-rule mb-4" />

      <div className="mb-4">
        <GridSizeSlider value={gridScale} onChange={onGridScaleChange} />
      </div>

      <HorizontalSquaresInput
        gridScale={gridScale}
        onGridScaleChange={onGridScaleChange}
        gridData={gridData}
      />

      <div className="mb-4">
        <GridOffsetJoystick
          offsetX={gridOffsetX}
          offsetY={gridOffsetY}
          onChange={onGridOffsetChange}
        />
      </div>

      {currentBattlemap ? (
        <div className="mb-1 pt-4" style={{ borderTop: "1px solid rgba(110, 83, 32, 0.3)" }}>
          <button
            type="button"
            onClick={handleDeleteBattlemap}
            disabled={disabled}
            className="parchment-numeric w-full px-3 py-2 text-sm border transition-colors disabled:opacity-50 hover:bg-[rgba(166,49,49,0.18)]"
            style={{
              color: "#7a2424",
              borderColor: "#7a2424",
              background: "rgba(166, 49, 49, 0.08)",
            }}
          >
            DELETE BATTLEMAP
          </button>
          {statusMessage ? (
            <div className="parchment-flavor text-xs mt-2" style={{ color: "var(--parchment-ink-muted)" }}>{statusMessage}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};


"use client";

import { useState } from "react";
import { Wand2 } from "lucide-react";
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
    detectAndApplyGrid,
  } = useBattlemap();

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [detectionMessage, setDetectionMessage] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);

  const handleDetectGrid = async () => {
    setIsDetecting(true);
    setDetectionMessage(null);
    const result = await detectAndApplyGrid();
    if (result.ok) {
      setDetectionMessage(
        `Detected grid: ${result.spacing.x}×${result.spacing.y}px`
      );
    } else if (result.reason === "no-image") {
      setDetectionMessage("No active map image to scan");
    } else if (result.reason === "low-confidence") {
      setDetectionMessage("Couldn't detect a grid");
    } else {
      setDetectionMessage("Detection failed");
    }
    setIsDetecting(false);
    setTimeout(() => setDetectionMessage(null), 3500);
  };

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
      <h3 className="glass-heading text-sm mb-1">Settings</h3>
      <div className=" mb-4" />

      <div className="mb-4">
        <button
          type="button"
          onClick={handleDetectGrid}
          disabled={disabled || isDetecting}
          className="glass-body w-full px-3 py-2 text-sm border flex items-center justify-center gap-2 transition-colors disabled:opacity-50 hover:bg-[var(--glass-highlight)]"
          style={{
            borderColor: "var(--glass-border)",
            background: "var(--glass-accent-soft, rgba(255,255,255,0.04))",
          }}
        >
          <Wand2 className="h-4 w-4" />
          {isDetecting ? "Detecting…" : "Detect grid"}
        </button>
        {detectionMessage ? (
          <div className="glass-muted text-xs mt-2" style={{ color: "var(--glass-txt-muted)" }}>
            {detectionMessage}
          </div>
        ) : null}
      </div>

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
        <div className="mb-1 pt-4" style={{ borderTop: "1px solid var(--glass-border)" }}>
          <button
            type="button"
            onClick={handleDeleteBattlemap}
            disabled={disabled}
            className="glass-numeric w-full px-3 py-2 text-sm border transition-colors disabled:opacity-50 hover:bg-[rgba(166,49,49,0.18)]"
            style={{
              color: "#7a2424",
              borderColor: "#7a2424",
              background: "rgba(166, 49, 49, 0.08)",
            }}
          >
            DELETE BATTLEMAP
          </button>
          {statusMessage ? (
            <div className="glass-muted text-xs mt-2" style={{ color: "var(--glass-txt-muted)" }}>{statusMessage}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};


"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Cloud, CloudOff, Layers, Settings as SettingsIcon, Users } from "lucide-react";
import { MapSettings } from "./Settings/MapSettings";
import { TokenPicker } from "./TokenPicker";
import { BattlemapManager } from "./BattlemapManager";
import { GridData } from "../../utils/gridData";
import { TokenTemplate } from "../../types";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

// Three semantic active-state colors so the GM can tell at a glance which
// tool is on. Cover = primary (general structures), spawn = success (player
// spawn), fog = warning (concealment). Matches the in-canvas preview colors.
// Belle Époque vocabulary: tool icons sit directly on the cream parchment.
// Idle icons render as warm-ink brass; active tools fill with the same brass
// gradient as the panel frames so the active state reads as "engraved
// emphasis" rather than a UI button color shift.
const TOOL_ACTIVE_BG: Record<"spawn" | "fog", string> = {
  spawn:
    "bg-[var(--brass-deep)] text-[var(--parchment-bright)] hover:bg-[var(--brass-shadow)]",
  fog:
    "bg-[var(--brass-deep)] text-[var(--parchment-bright)] hover:bg-[var(--brass-shadow)]",
};
const TOOL_BASE = "rounded-sm p-3 transition-colors";
const TOOL_INACTIVE =
  "text-[var(--brass-deep)] hover:text-[var(--brass-shadow)] hover:bg-[rgba(201,162,74,0.18)]";

interface SidebarToolbarProps {
  gridScale: number;
  onGridScaleChange: (value: number) => void;
  gridOffsetX: number;
  gridOffsetY: number;
  onGridOffsetChange: (x: number, y: number) => void;
  onTokenDragStart: (tokenTemplate: TokenTemplate) => void;
  onTokenDragEnd: () => void;
  onSpawnToolToggle: () => void;
  isSpawnToolActive: boolean;
  onFogToolToggle: () => void;
  isFogToolActive: boolean;
  onFogClear: () => void;
  fogReady: boolean;
  gridData: GridData;
  floorCount?: number;
  floorIndex?: number;
  floorLabel?: string | null;
  onPrevFloor?: () => void;
  onNextFloor?: () => void;
  floorControlsDisabled?: boolean;
}

export const SidebarToolbar = ({
  gridScale,
  onGridScaleChange,
  gridOffsetX,
  gridOffsetY,
  onGridOffsetChange,
  onTokenDragStart,
  onTokenDragEnd,
  onSpawnToolToggle,
  isSpawnToolActive,
  onFogToolToggle,
  isFogToolActive,
  onFogClear,
  fogReady,
  gridData,
  floorCount = 0,
  floorIndex = 0,
  floorLabel = null,
  onPrevFloor,
  onNextFloor,
  floorControlsDisabled = false,
}: SidebarToolbarProps) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMapManagerOpen, setIsMapManagerOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Close settings when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
        setIsMapManagerOpen(false);
      }
    };

    if (isSettingsOpen || isMapManagerOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isSettingsOpen, isMapManagerOpen]);

  return (
    <div
      ref={toolbarRef}
      className="parchment-panel fixed left-4 top-1/4 -translate-y-1/2 z-50 shadow-lg flex flex-col p-1 gap-1 border border-[var(--brass-deep)]"
    >
      {/* Settings */}
      <div className="relative">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsSettingsOpen(!isSettingsOpen);
              }}
              className={`relative ${TOOL_BASE} ${
                isSettingsOpen ? "bg-[rgba(201,162,74,0.25)] text-[var(--brass-shadow)]" : TOOL_INACTIVE
              }`}
              aria-label="Settings"
            >
              <SettingsIcon className="h-6 w-6" strokeWidth={2} />
              <div className="absolute bottom-1 right-1 w-0 h-0 border-l-[5px] border-l-transparent border-b-[5px] border-b-[var(--brass-deep)]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>

        {isSettingsOpen && (
          <div className="parchment-panel absolute left-full ml-2 top-0 border border-[var(--brass-deep)] p-4 shadow-lg min-w-[280px]">
            <MapSettings
              gridScale={gridScale}
              onGridScaleChange={onGridScaleChange}
              gridOffsetX={gridOffsetX}
              gridOffsetY={gridOffsetY}
              onGridOffsetChange={onGridOffsetChange}
              gridData={gridData}
            />
          </div>
        )}
      </div>

      {/* Map manager */}
      <div className="relative">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsMapManagerOpen(!isMapManagerOpen);
                if (!isMapManagerOpen) setIsSettingsOpen(false);
              }}
              className={`relative ${TOOL_BASE} ${
                isMapManagerOpen ? "bg-[rgba(201,162,74,0.25)] text-[var(--brass-shadow)]" : TOOL_INACTIVE
              }`}
              aria-label="Battlemap Manager"
            >
              <Layers className="h-6 w-6" strokeWidth={2} />
              <div className="absolute bottom-1 right-1 w-0 h-0 border-l-[5px] border-l-transparent border-b-[5px] border-b-[var(--brass-deep)]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Maps</TooltipContent>
        </Tooltip>

        {isMapManagerOpen && (
          <div className="parchment-panel absolute left-full ml-2 top-0 border border-[var(--brass-deep)] p-4 shadow-lg w-[400px] max-h-[70vh] overflow-hidden flex flex-col">
            <BattlemapManager onClose={() => setIsMapManagerOpen(false)} />
          </div>
        )}
      </div>

      {/* Floor controls */}
      {floorCount > 1 && typeof onPrevFloor === "function" && typeof onNextFloor === "function" && (
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPrevFloor();
              }}
              disabled={floorControlsDisabled}
              className="flex-1 rounded-sm px-2 py-2 text-[var(--brass-deep)] hover:text-[var(--brass-shadow)] hover:bg-[rgba(201,162,74,0.18)] transition-colors disabled:opacity-50 flex items-center justify-center"
              aria-label="Previous floor"
              title="Previous floor"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNextFloor();
              }}
              disabled={floorControlsDisabled}
              className="flex-1 rounded-sm px-2 py-2 text-[var(--brass-deep)] hover:text-[var(--brass-shadow)] hover:bg-[rgba(201,162,74,0.18)] transition-colors disabled:opacity-50 flex items-center justify-center"
              aria-label="Next floor"
              title="Next floor"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="parchment-numeric text-center px-1" style={{ fontSize: "0.65rem", color: "var(--brass-deep)" }}>
            {floorLabel ? floorLabel : `Floor ${floorIndex + 1}`} ({floorIndex + 1}/{floorCount})
          </div>
        </div>
      )}

      {/* Token picker */}
      <div className="relative">
        <TokenPicker onTokenDragStart={onTokenDragStart} onTokenDragEnd={onTokenDragEnd} />
      </div>

      {/* Spawn area — single-shot drag. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSpawnToolToggle();
            }}
            className={`${TOOL_BASE} ${
              isSpawnToolActive ? TOOL_ACTIVE_BG.spawn : TOOL_INACTIVE
            }`}
            aria-label="Spawn area tool"
            aria-pressed={isSpawnToolActive}
          >
            <Users className="h-6 w-6" strokeWidth={2} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Spawn area — drag a rectangle</TooltipContent>
      </Tooltip>

      {/* Fog — drag to reveal; right-click to clear. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFogToolToggle();
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (fogReady) onFogClear();
            }}
            className={`${TOOL_BASE} ${
              isFogToolActive ? TOOL_ACTIVE_BG.fog : TOOL_INACTIVE
            }`}
            aria-label="Fog of war"
            aria-pressed={isFogToolActive}
          >
            {isFogToolActive ? (
              <Cloud className="h-6 w-6" strokeWidth={2} />
            ) : (
              <CloudOff className="h-6 w-6" strokeWidth={2} />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          {fogReady ? "Fog — drag to reveal · right-click to clear" : "Fog — drag to reveal"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
};


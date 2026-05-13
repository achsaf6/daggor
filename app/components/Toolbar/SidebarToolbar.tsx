"use client";

import { useState, useRef, useEffect } from "react";
import {
  Building2,
  Check,
  Cloud,
  CloudOff,
  Layers,
  Settings as SettingsIcon,
  Users,
} from "lucide-react";
import { MapSettings } from "./Settings/MapSettings";
import { TokenPicker } from "./TokenPicker";
import { BattlemapManager } from "./BattlemapManager";
import { GridData } from "../../utils/gridData";
import { TokenTemplate } from "../../types";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { useClampedFlyoutPlacement } from "../../hooks/useClampedFlyoutPlacement";

// Glass Atelier vertical icon ribbon. Slim 44px-wide glass strip on the left
// edge; tools are 36px icon buttons. Active tools pick up the cool-blue
// accent. Flyouts (Settings, Battlemap Manager, Token Picker) slide out to
// the right and are themselves glass panels.
const TOOL_BASE =
  "relative grid place-items-center transition-colors rounded-lg";
const TOOL_SIZE = { width: 36, height: 36 } as const;
const TOOL_INACTIVE_STYLE: React.CSSProperties = {
  color: "var(--glass-txt-muted)",
};
const TOOL_ACTIVE_STYLE: React.CSSProperties = {
  background: "var(--glass-accent-soft)",
  color: "var(--glass-accent)",
};
const TOOL_OPEN_STYLE: React.CSSProperties = {
  background: "var(--glass-highlight)",
  color: "var(--glass-txt)",
};

interface FloorSummary {
  id: string;
  name: string | null;
}

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
  // Floor picker is hidden entirely when there's only one floor (or none).
  // The button shows only on multi-floor maps; click opens a glass flyout
  // listing all floors with the active one checked.
  floors?: FloorSummary[];
  activeFloorId?: string | null;
  onSelectFloor?: (floorId: string) => void;
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
  floors = [],
  activeFloorId = null,
  onSelectFloor,
  floorControlsDisabled = false,
}: SidebarToolbarProps) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMapManagerOpen, setIsMapManagerOpen] = useState(false);
  const [isFloorPickerOpen, setIsFloorPickerOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Trigger refs feed into useClampedFlyoutPlacement so each flyout positions
  // itself near its button but never spills past the viewport bottom.
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const mapsBtnRef = useRef<HTMLButtonElement>(null);
  const floorsBtnRef = useRef<HTMLButtonElement>(null);

  // minHeight reflects how much vertical room each flyout's content
  // *prefers* — when the trigger is too low, the flyout shifts up just
  // enough to give itself this much room (capped by viewport - margins).
  const settingsPlacement = useClampedFlyoutPlacement(settingsBtnRef, isSettingsOpen, { minHeight: 360 });
  const mapsPlacement = useClampedFlyoutPlacement(mapsBtnRef, isMapManagerOpen, { minHeight: 480 });
  const floorsPlacement = useClampedFlyoutPlacement(floorsBtnRef, isFloorPickerOpen, { minHeight: 120 });

  // Multi-floor only: there's no point in a picker for a single-floor map.
  const hasMultipleFloors = floors.length > 1;
  const activeFloorIndex = hasMultipleFloors
    ? Math.max(0, floors.findIndex((f) => f.id === activeFloorId))
    : 0;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
        setIsMapManagerOpen(false);
        setIsFloorPickerOpen(false);
      }
    };
    if (isSettingsOpen || isMapManagerOpen || isFloorPickerOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isSettingsOpen, isMapManagerOpen, isFloorPickerOpen]);

  return (
    // Outer wrapper handles vertical centering via flexbox so the toolbar
    // itself has no `transform`. Fixed-position flyouts inside the toolbar
    // would otherwise be positioned relative to a transformed ancestor (CSS
    // makes any element with `transform`/`perspective`/`filter` the
    // containing block for `position: fixed` children), breaking
    // `useClampedFlyoutPlacement`'s viewport math by a few hundred pixels.
    <div
      className="fixed left-4 top-0 bottom-0 z-50 flex items-center pointer-events-none"
    >
    <div
      ref={toolbarRef}
      className="glass-panel flex flex-col gap-1 p-1.5 pointer-events-auto"
    >
      {/* Settings */}
      <div className="relative">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              ref={settingsBtnRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsSettingsOpen((v) => !v);
                if (!isSettingsOpen) {
                  setIsMapManagerOpen(false);
                  setIsFloorPickerOpen(false);
                }
              }}
              className={TOOL_BASE}
              style={{ ...TOOL_SIZE, ...(isSettingsOpen ? TOOL_OPEN_STYLE : TOOL_INACTIVE_STYLE) }}
              aria-label="Settings"
            >
              <SettingsIcon className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>

        {isSettingsOpen && settingsPlacement && (
          <div
            className="glass-panel fixed flex flex-col"
            style={{
              left: settingsPlacement.left,
              top: settingsPlacement.top,
              maxHeight: settingsPlacement.maxHeight,
              minWidth: 300,
            }}
          >
            <div className="overflow-y-auto p-4">
              <MapSettings
                gridScale={gridScale}
                onGridScaleChange={onGridScaleChange}
                gridOffsetX={gridOffsetX}
                gridOffsetY={gridOffsetY}
                onGridOffsetChange={onGridOffsetChange}
                gridData={gridData}
              />
            </div>
          </div>
        )}
      </div>

      {/* Map manager */}
      <div className="relative">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              ref={mapsBtnRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsMapManagerOpen((v) => !v);
                if (!isMapManagerOpen) {
                  setIsSettingsOpen(false);
                  setIsFloorPickerOpen(false);
                }
              }}
              className={TOOL_BASE}
              style={{
                ...TOOL_SIZE,
                ...(isMapManagerOpen ? TOOL_OPEN_STYLE : TOOL_INACTIVE_STYLE),
              }}
              aria-label="Battlemap Manager"
            >
              <Layers className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Maps</TooltipContent>
        </Tooltip>

        {isMapManagerOpen && mapsPlacement && (
          <div
            className="glass-panel fixed flex flex-col"
            style={{
              left: mapsPlacement.left,
              top: mapsPlacement.top,
              maxHeight: mapsPlacement.maxHeight,
              width: 420,
            }}
          >
            <div className="overflow-y-auto p-4">
              <BattlemapManager onClose={() => setIsMapManagerOpen(false)} />
            </div>
          </div>
        )}
      </div>

      {/* Floor picker — single button with a numeric badge showing the
          active floor. Click opens a glass flyout listing all floors. Only
          rendered when the current battlemap actually has multiple floors. */}
      {hasMultipleFloors && (
        <div className="relative">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                ref={floorsBtnRef}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFloorPickerOpen((v) => !v);
                  if (!isFloorPickerOpen) {
                    setIsSettingsOpen(false);
                    setIsMapManagerOpen(false);
                  }
                }}
                disabled={floorControlsDisabled}
                className={TOOL_BASE}
                style={{
                  ...TOOL_SIZE,
                  ...(isFloorPickerOpen ? TOOL_OPEN_STYLE : TOOL_INACTIVE_STYLE),
                  opacity: floorControlsDisabled ? 0.4 : 1,
                }}
                aria-label="Floors"
              >
                <Building2 className="h-4 w-4" strokeWidth={1.75} />
                <span
                  aria-hidden
                  className="absolute"
                  style={{
                    top: 3,
                    right: 3,
                    minWidth: 14,
                    height: 14,
                    padding: "0 3px",
                    borderRadius: 7,
                    background: "var(--glass-accent)",
                    color: "#0e0e10",
                    fontSize: 9,
                    fontWeight: 700,
                    display: "grid",
                    placeItems: "center",
                    lineHeight: 1,
                  }}
                >
                  {activeFloorIndex + 1}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Floors</TooltipContent>
          </Tooltip>

          {isFloorPickerOpen && floorsPlacement && (
            <div
              className="glass-panel fixed flex flex-col"
              style={{
                left: floorsPlacement.left,
                top: floorsPlacement.top,
                maxHeight: floorsPlacement.maxHeight,
                minWidth: 200,
              }}
            >
              <ul className="flex flex-col overflow-y-auto p-1.5">
                {floors.map((floor, idx) => {
                  const isActive = floor.id === activeFloorId;
                  const label = floor.name?.trim() || `Floor ${idx + 1}`;
                  return (
                    <li key={floor.id}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isActive) onSelectFloor?.(floor.id);
                          setIsFloorPickerOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors"
                        style={{
                          background: isActive ? "var(--glass-accent-soft)" : "transparent",
                          color: isActive ? "var(--glass-accent)" : "var(--glass-txt)",
                          fontWeight: isActive ? 500 : 400,
                          textAlign: "left",
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) e.currentTarget.style.background = "var(--glass-highlight)";
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) e.currentTarget.style.background = "transparent";
                        }}
                      >
                        <span
                          className="grid place-items-center"
                          style={{ width: 14, height: 14 }}
                        >
                          {isActive && <Check className="h-3 w-3" strokeWidth={2.5} />}
                        </span>
                        <span className="flex-1 truncate">{label}</span>
                        <span
                          className="glass-numeric"
                          style={{ fontSize: 10, color: "var(--glass-txt-faint)" }}
                        >
                          {idx + 1}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Separator before tool group */}
      <div
        aria-hidden
        className="my-1 mx-auto"
        style={{ width: 24, height: 1, background: "var(--glass-border)" }}
      />

      {/* Token picker */}
      <div className="relative">
        <TokenPicker onTokenDragStart={onTokenDragStart} onTokenDragEnd={onTokenDragEnd} />
      </div>

      {/* Spawn area */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSpawnToolToggle();
            }}
            className={TOOL_BASE}
            style={{
              ...TOOL_SIZE,
              ...(isSpawnToolActive ? TOOL_ACTIVE_STYLE : TOOL_INACTIVE_STYLE),
            }}
            aria-label="Spawn area tool"
            aria-pressed={isSpawnToolActive}
          >
            <Users className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Spawn area — drag a rectangle</TooltipContent>
      </Tooltip>

      {/* Fog */}
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
            className={TOOL_BASE}
            style={{
              ...TOOL_SIZE,
              ...(isFogToolActive ? TOOL_ACTIVE_STYLE : TOOL_INACTIVE_STYLE),
            }}
            aria-label="Fog of war"
            aria-pressed={isFogToolActive}
          >
            {isFogToolActive ? (
              <Cloud className="h-4 w-4" strokeWidth={1.75} />
            ) : (
              <CloudOff className="h-4 w-4" strokeWidth={1.75} />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          {fogReady ? "Fog — drag to reveal · right-click to clear" : "Fog — drag to reveal"}
        </TooltipContent>
      </Tooltip>
    </div>
    </div>
  );
};

"use client";

import { useState, useRef, useEffect } from "react";
import { MapSettings } from "./MapSettings";
import { TokenPicker } from "./TokenPicker";

interface SidebarToolbarProps {
  gridScale: number;
  onGridScaleChange: (value: number) => void;
  gridOffsetX: number;
  gridOffsetY: number;
  onGridOffsetChange: (x: number, y: number) => void;
  onTokenDragStart: (color: string) => void;
  onTokenDragEnd: () => void;
  onSquareToolToggle: () => void;
  onSquareToolLockToggle: () => void;
  isSquareToolActive: boolean;
  isSquareToolLocked: boolean;
}

export const SidebarToolbar = ({
  gridScale,
  onGridScaleChange,
  gridOffsetX,
  gridOffsetY,
  onGridOffsetChange,
  onTokenDragStart,
  onTokenDragEnd,
  onSquareToolToggle,
  onSquareToolLockToggle,
  isSquareToolActive,
  isSquareToolLocked,
}: SidebarToolbarProps) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const squareToolPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const squareToolPressStartRef = useRef<number | null>(null);
  const squareToolLongPressDetectedRef = useRef<boolean>(false);

  // Close settings when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    };

    if (isSettingsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isSettingsOpen]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (squareToolPressTimerRef.current) {
        clearTimeout(squareToolPressTimerRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={toolbarRef}
      className="fixed left-4 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-2"
    >
      {/* Settings Button with Gear Icon */}
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsSettingsOpen(!isSettingsOpen);
          }}
          className={`bg-black/80 backdrop-blur-sm rounded-lg p-3 shadow-lg border border-white/20 text-white hover:bg-black/90 transition-all ${
            isSettingsOpen ? "bg-black/90" : ""
          }`}
          aria-label="Settings"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>

        {/* Settings Dropdown */}
        {isSettingsOpen && (
          <div className="absolute left-full ml-2 top-0 bg-black/80 backdrop-blur-sm rounded-lg p-4 shadow-lg border border-white/20 min-w-[280px]">
            <MapSettings
              gridScale={gridScale}
              onGridScaleChange={onGridScaleChange}
              gridOffsetX={gridOffsetX}
              gridOffsetY={gridOffsetY}
              onGridOffsetChange={onGridOffsetChange}
            />
          </div>
        )}
      </div>

      {/* Token Picker */}
      <TokenPicker onTokenDragStart={onTokenDragStart} onTokenDragEnd={onTokenDragEnd} />

      {/* Square Cover Tool */}
      <button
        onMouseDown={(e) => {
          e.stopPropagation();
          if (isSquareToolLocked) {
            return;
          }
          squareToolPressStartRef.current = Date.now();
          squareToolLongPressDetectedRef.current = false;
          squareToolPressTimerRef.current = setTimeout(() => {
            squareToolLongPressDetectedRef.current = true;
            onSquareToolLockToggle();
            if (squareToolPressTimerRef.current) {
              clearTimeout(squareToolPressTimerRef.current);
              squareToolPressTimerRef.current = null;
            }
            squareToolPressStartRef.current = null;
          }, 500);
        }}
        onMouseUp={(e) => {
          e.stopPropagation();
          if (squareToolPressTimerRef.current) {
            clearTimeout(squareToolPressTimerRef.current);
            squareToolPressTimerRef.current = null;
          }

          if (squareToolLongPressDetectedRef.current) {
            squareToolLongPressDetectedRef.current = false;
            squareToolPressStartRef.current = null;
            return;
          }

          if (isSquareToolLocked) {
            onSquareToolLockToggle();
            squareToolPressStartRef.current = null;
            squareToolLongPressDetectedRef.current = false;
            return;
          }

          const pressDuration = squareToolPressStartRef.current
            ? Date.now() - squareToolPressStartRef.current
            : 0;

          if (pressDuration < 500) {
            onSquareToolToggle();
          }

          squareToolPressStartRef.current = null;
          squareToolLongPressDetectedRef.current = false;
        }}
        onMouseLeave={() => {
          if (squareToolPressTimerRef.current) {
            clearTimeout(squareToolPressTimerRef.current);
            squareToolPressTimerRef.current = null;
          }
          squareToolPressStartRef.current = null;
          squareToolLongPressDetectedRef.current = false;
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className={`backdrop-blur-sm rounded-lg p-3 shadow-lg border text-white transition-all ${
          isSquareToolActive
            ? isSquareToolLocked
              ? "bg-blue-700/90 border-blue-500 hover:bg-blue-800/90"
              : "bg-blue-600/90 border-blue-400 hover:bg-blue-700/90"
            : "bg-black/80 border-white/20 hover:bg-black/90"
        }`}
        aria-label="Square Cover Tool"
        title={
          isSquareToolLocked
            ? "Square tool locked - click to unlock"
            : "Click to create one square, hold for 0.5s to lock"
        }
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        </svg>
      </button>
    </div>
  );
};


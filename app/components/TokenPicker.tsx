"use client";

import { useState, useRef, useEffect } from "react";

interface TokenPickerProps {
  onTokenDragStart: (color: string) => void;
  onTokenDragEnd: () => void;
}

const AVAILABLE_COLORS = [
  { name: "Red", value: "#ef4444" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Green", value: "#10b981" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Purple", value: "#8b5cf6" },
  { name: "Pink", value: "#ec4899" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Lime", value: "#84cc16" },
  { name: "Orange", value: "#f97316" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Yellow", value: "#eab308" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Violet", value: "#a855f7" },
  { name: "Emerald", value: "#059669" },
  { name: "Sky", value: "#0ea5e9" },
];

export const TokenPicker = ({ onTokenDragStart, onTokenDragEnd }: TokenPickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleTokenDragStart = (e: React.DragEvent, color: string) => {
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", color);
    // Set a custom drag image (optional - browser will use default)
    onTokenDragStart(color);
  };

  const handleTokenDragEnd = () => {
    onTokenDragEnd();
  };

  return (
    <div ref={pickerRef} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`relative rounded-md p-3 text-white hover:bg-black/90 transition-all ${
          isOpen ? "bg-black/90" : ""
        }`}
        aria-label="Add Token"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="12" cy="12" r="10" />
        </svg>
        {/* Dropdown indicator triangle */}
        <div className="absolute bottom-0 right-0 w-0 h-0 border-l-[6px] border-l-transparent border-b-[6px] border-b-white/60" />
      </button>

      {/* Token Picker Dropdown */}
      {isOpen && (
        <div className="absolute left-full ml-2 top-0 bg-black/80 backdrop-blur-sm rounded-lg p-4 shadow-lg border border-white/20 min-w-[200px]">
          <h3 className="text-white text-sm font-semibold mb-3">Select Token Color</h3>
          <div className="grid grid-cols-4 gap-2">
            {AVAILABLE_COLORS.map((color) => (
              <div
                key={color.value}
                draggable
                onDragStart={(e) => handleTokenDragStart(e, color.value)}
                onDragEnd={handleTokenDragEnd}
                className="w-10 h-10 rounded-full border-2 border-white shadow-md hover:scale-110 transition-transform cursor-grab active:cursor-grabbing"
                style={{ backgroundColor: color.value }}
                title={`Drag ${color.name} token to map`}
                aria-label={`Drag ${color.name} token to map`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};


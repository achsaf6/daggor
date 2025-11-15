"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface GridOffsetJoystickProps {
  offsetX: number;
  offsetY: number;
  onChange: (x: number, y: number) => void;
  maxOffset?: number; // Maximum offset in pixels
  stepSize?: number; // Step size for arrow key adjustments in pixels
}

export const GridOffsetJoystick = ({
  offsetX,
  offsetY,
  onChange,
  maxOffset = 100,
  stepSize = 0.01,
}: GridOffsetJoystickProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const joystickRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Focus the element so it can receive keyboard events
    if (joystickRef.current) {
      joystickRef.current.focus();
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Focus the element so it can receive keyboard events
    if (joystickRef.current) {
      joystickRef.current.focus();
    }
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !joystickRef.current) return;

      const rect = joystickRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Calculate offset from center (-1 to 1 range)
      const deltaX = (e.clientX - centerX) / (rect.width / 2);
      const deltaY = (e.clientY - centerY) / (rect.height / 2);

      // Clamp to circle bounds (for joystick feel)
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const clampedDistance = Math.min(distance, 1);
      const angle = Math.atan2(deltaY, deltaX);

      const clampedX = Math.cos(angle) * clampedDistance;
      const clampedY = Math.sin(angle) * clampedDistance;

      // Convert to pixel offset
      onChange(clampedX * maxOffset, clampedY * maxOffset);
    },
    [isDragging, maxOffset, onChange]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Add global mouse event listeners when dragging
  const handleGlobalMouseMove = useCallback(
    (e: MouseEvent) => {
      handleMouseMove(e);
    },
    [handleMouseMove]
  );

  const handleGlobalMouseUp = useCallback(() => {
    handleMouseUp();
  }, [handleMouseUp]);

  // Set up global listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleGlobalMouseMove);
      document.addEventListener("mouseup", handleGlobalMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleGlobalMouseMove);
        document.removeEventListener("mouseup", handleGlobalMouseUp);
      };
    }
  }, [isDragging, handleGlobalMouseMove, handleGlobalMouseUp]);

  // Handle arrow key adjustments
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();

        let newX = offsetX;
        let newY = offsetY;

        if (e.key === "ArrowLeft") {
          newX = Math.max(-maxOffset, offsetX - stepSize);
        } else if (e.key === "ArrowRight") {
          newX = Math.min(maxOffset, offsetX + stepSize);
        } else if (e.key === "ArrowUp") {
          newY = Math.max(-maxOffset, offsetY - stepSize);
        } else if (e.key === "ArrowDown") {
          newY = Math.min(maxOffset, offsetY + stepSize);
        }

        onChange(newX, newY);
      }
    },
    [offsetX, offsetY, onChange, maxOffset, stepSize]
  );

  // Convert pixel offset to normalized position (-1 to 1)
  const normalizedX = Math.max(-1, Math.min(1, offsetX / maxOffset));
  const normalizedY = Math.max(-1, Math.min(1, offsetY / maxOffset));

  // Calculate position in pixels (center of joystick area)
  const joystickSize = 120; // Size of the joystick area
  const knobSize = 12; // Size of the knob
  const knobX = joystickSize / 2 + normalizedX * (joystickSize / 2 - knobSize / 2);
  const knobY = joystickSize / 2 + normalizedY * (joystickSize / 2 - knobSize / 2);

  return (
    <div>
      <label className="block text-white text-sm font-medium mb-2">
        Grid Offset
      </label>
      <div
        ref={joystickRef}
        className="relative border-2 border-white/30 rounded-lg bg-gray-800/50 cursor-crosshair select-none focus:outline-none focus:ring-2 focus:ring-white/50"
        style={{
          width: `${joystickSize}px`,
          height: `${joystickSize}px`,
          margin: "0 auto",
        }}
        tabIndex={0}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onKeyDown={handleKeyDown}
      >
        {/* Draggable knob */}
        <div
          className="absolute bg-white rounded-full shadow-lg transition-transform"
          style={{
            width: `${knobSize}px`,
            height: `${knobSize}px`,
            left: `${knobX}px`,
            top: `${knobY}px`,
            transform: "translate(-50%, -50%)",
            cursor: isDragging ? "grabbing" : "grab",
            transition: isDragging ? "none" : "all 0.1s ease-out",
          }}
        />

        {/* Center dot */}
        <div
          className="absolute bg-white/50 rounded-full"
          style={{
            width: "4px",
            height: "4px",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
          }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-2">
        <span>X: {offsetX.toFixed(0)}px</span>
        <span>Y: {offsetY.toFixed(0)}px</span>
      </div>
    </div>
  );
};


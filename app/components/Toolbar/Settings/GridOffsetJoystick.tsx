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
  const [editingField, setEditingField] = useState<"x" | "y" | null>(null);
  const [editValue, setEditValue] = useState("");
  const joystickRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Handle double-click to edit
  const handleDoubleClick = useCallback(
    (field: "x" | "y") => {
      setEditingField(field);
      setEditValue(field === "x" ? offsetX.toFixed(0) : offsetY.toFixed(0));
    },
    [offsetX, offsetY]
  );

  // Handle input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value);
  }, []);

  // Handle input submission
  const handleInputSubmit = useCallback(() => {
    if (editingField === null) return;

    const numValue = parseFloat(editValue);
    if (!isNaN(numValue)) {
      const clampedValue = Math.max(-maxOffset, Math.min(maxOffset, numValue));
      if (editingField === "x") {
        onChange(clampedValue, offsetY);
      } else {
        onChange(offsetX, clampedValue);
      }
    }
    setEditingField(null);
    setEditValue("");
  }, [editingField, editValue, maxOffset, offsetX, offsetY, onChange]);

  // Handle input key down
  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleInputSubmit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setEditingField(null);
        setEditValue("");
      }
    },
    [handleInputSubmit]
  );

  // Focus input when editing starts
  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingField]);

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
      <label className="parchment-numeric block text-xs mb-2" style={{ color: "var(--parchment-ink-muted)" }}>
        Grid Offset
      </label>
      <div
        ref={joystickRef}
        className="relative cursor-crosshair select-none focus:outline-none"
        style={{
          width: `${joystickSize}px`,
          height: `${joystickSize}px`,
          margin: "0 auto",
          borderColor: "var(--brass-deep)",
          borderStyle: "solid",
          borderWidth: 1,
          background: "rgba(255, 252, 240, 0.4)",
        }}
        tabIndex={0}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onKeyDown={handleKeyDown}
      >
        <div className="absolute inset-y-0 left-1/2 -translate-x-px w-px" style={{ background: "rgba(110, 83, 32, 0.3)" }} aria-hidden />
        <div className="absolute inset-x-0 top-1/2 -translate-y-px h-px" style={{ background: "rgba(110, 83, 32, 0.3)" }} aria-hidden />

        <div
          className="absolute rounded-full shadow-lg"
          style={{
            width: `${knobSize}px`,
            height: `${knobSize}px`,
            left: `${knobX}px`,
            top: `${knobY}px`,
            transform: "translate(-50%, -50%)",
            cursor: isDragging ? "grabbing" : "grab",
            transition: isDragging ? "none" : "all 0.1s ease-out",
            backgroundColor: "var(--brass-deep)",
            boxShadow: "0 0 0 2px var(--parchment-bright), 0 0 0 3px var(--brass-shadow)",
          }}
        />

        <div
          className="absolute rounded-full"
          style={{
            width: "4px",
            height: "4px",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            backgroundColor: "var(--brass-shadow)",
          }}
        />
      </div>
      <div className="parchment-numeric flex justify-between mt-2" style={{ fontSize: "0.75rem", color: "var(--parchment-ink-muted)" }}>
        {editingField === "x" ? (
          <span className="flex items-center gap-1">
            X:{" "}
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={handleInputChange}
              onBlur={handleInputSubmit}
              onKeyDown={handleInputKeyDown}
              className="parchment-numeric w-10 px-1 border focus:outline-none"
              style={{ fontSize: "inherit", borderColor: "var(--brass-deep)", color: "var(--parchment-ink)", background: "rgba(255, 252, 240, 0.6)" }}
            />
            px
          </span>
        ) : (
          <span
            onDoubleClick={() => handleDoubleClick("x")}
            className="cursor-pointer transition-colors hover:text-[var(--brass-shadow)]"
          >
            X: {offsetX.toFixed(0)}px
          </span>
        )}
        {editingField === "y" ? (
          <span className="flex items-center gap-1">
            Y:{" "}
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={handleInputChange}
              onBlur={handleInputSubmit}
              onKeyDown={handleInputKeyDown}
              className="parchment-numeric w-10 px-1 border focus:outline-none"
              style={{ fontSize: "inherit", borderColor: "var(--brass-deep)", color: "var(--parchment-ink)", background: "rgba(255, 252, 240, 0.6)" }}
            />
            px
          </span>
        ) : (
          <span
            onDoubleClick={() => handleDoubleClick("y")}
            className="cursor-pointer transition-colors hover:text-[var(--brass-shadow)]"
          >
            Y: {offsetY.toFixed(0)}px
          </span>
        )}
      </div>
    </div>
  );
};


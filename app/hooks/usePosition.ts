import { useState, useCallback } from "react";
import { Position } from "../types";
import { ImageBounds } from "../types";
import { getImagePosition } from "../utils/coordinates";

interface UsePositionReturn {
  isDragging: boolean;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleTouchStart: (e: React.TouchEvent) => void;
  handleMouseMove: (e: React.MouseEvent) => void;
  handleTouchMove: (e: React.TouchEvent) => void;
  handleMouseUp: () => void;
  handleTouchEnd: () => void;
  updatePosition: (clientX: number, clientY: number) => Position | null;
}

export const usePosition = (
  imageBounds: ImageBounds | null,
  onPositionUpdate: (position: Position) => void
): UsePositionReturn => {
  const [isDragging, setIsDragging] = useState(false);

  const updatePosition = useCallback(
    (clientX: number, clientY: number): Position | null => {
      const newPosition = getImagePosition(clientX, clientY, imageBounds);
      if (newPosition) {
        onPositionUpdate(newPosition);
      }
      return newPosition;
    },
    [imageBounds, onPositionUpdate]
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      e.preventDefault();
      updatePosition(e.clientX, e.clientY);
    },
    [isDragging, updatePosition]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging) return;
      e.preventDefault();
      const touch = e.touches[0];
      if (touch) {
        updatePosition(touch.clientX, touch.clientY);
      }
    },
    [isDragging, updatePosition]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  return {
    isDragging,
    handleMouseDown,
    handleTouchStart,
    handleMouseMove,
    handleTouchMove,
    handleMouseUp,
    handleTouchEnd,
    updatePosition,
  };
};


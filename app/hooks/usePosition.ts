import { useState, useCallback } from "react";
import { Position } from "../types";
import { ImageBounds } from "../types";
import { getImagePosition, snapToGridCenter } from "../utils/coordinates";
import { useCoordinateMapper } from "./useCoordinateMapper";

interface TransformConfig {
  scale: number;
  translateX: number;
  translateY: number;
}

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

interface GridSnapConfig {
  gridData?: {
    verticalLines: number[];
    horizontalLines: number[];
    imageWidth: number;
    imageHeight: number;
  };
  gridScale?: number;
  gridOffsetX?: number;
  gridOffsetY?: number;
}

/**
 * Apply inverse transform to screen coordinates to account for CSS transforms
 * CSS transforms apply right-to-left: scale(s) translate(x, y) means translate first, then scale
 * With transformOrigin: center center, the scale happens around the center point
 * 
 * Forward transform: P' = center + (P + translate - center) * scale
 * Inverse transform: P = center + (P' - center) / scale - translate
 */
const applyInverseTransform = (
  x: number,
  y: number,
  transform: TransformConfig,
  containerBounds: { left: number; top: number; width: number; height: number }
): { x: number; y: number } => {
  if (transform.scale === 1) {
    return { x, y };
  }

  // Get the center of the container (transform origin)
  const centerX = containerBounds.left + containerBounds.width / 2;
  const centerY = containerBounds.top + containerBounds.height / 2;

  // Translate coordinates relative to center
  const relativeX = x - centerX;
  const relativeY = y - centerY;

  // Apply inverse transform
  // Forward: P' = center + (P + translate - center) * scale
  // Inverse: P = center + (P' - center) / scale - translate
  const inverseScale = 1 / transform.scale;
  const untransformedX = relativeX * inverseScale - transform.translateX;
  const untransformedY = relativeY * inverseScale - transform.translateY;

  // Translate back to absolute coordinates
  return {
    x: untransformedX + centerX,
    y: untransformedY + centerY,
  };
};

export const usePosition = (
  imageBounds: ImageBounds | null,
  onPositionUpdate: (position: Position) => void,
  worldMapWidth: number = 0,
  worldMapHeight: number = 0,
  transform?: TransformConfig,
  gridSnapConfig?: GridSnapConfig
): UsePositionReturn => {
  const [isDragging, setIsDragging] = useState(false);
  const [lastPosition, setLastPosition] = useState<Position | null>(null);
  const coordinateMapper = useCoordinateMapper(
    imageBounds,
    worldMapWidth,
    worldMapHeight
  );

  const updatePosition = useCallback(
    (clientX: number, clientY: number): Position | null => {
      if (!imageBounds) return null;

      // Apply inverse transform if in mobile mode
      let adjustedX = clientX;
      let adjustedY = clientY;
      
      if (transform && transform.scale !== 1) {
        const containerBounds = {
          left: imageBounds.containerLeft,
          top: imageBounds.containerTop,
          width: imageBounds.containerWidth,
          height: imageBounds.containerHeight,
        };
        const adjusted = applyInverseTransform(clientX, clientY, transform, containerBounds);
        adjustedX = adjusted.x;
        adjustedY = adjusted.y;
      }

      // Use coordinate mapper if available, otherwise fallback to old system
      let position: Position | null = null;
      
      if (coordinateMapper.isReady && worldMapWidth > 0 && worldMapHeight > 0) {
        const screenPos = { x: adjustedX, y: adjustedY };
        const imageRelative = coordinateMapper.screenToImageRelative(screenPos);
        if (imageRelative) {
          position = { x: imageRelative.x, y: imageRelative.y };
        }
      } else {
        // Fallback to old system
        position = getImagePosition(adjustedX, adjustedY, imageBounds);
      }

      if (position) {
        // Store the position for snapping on release
        setLastPosition(position);
        // Don't snap during dragging, only update position
        onPositionUpdate(position);
        return position;
      }
      return null;
    },
    [imageBounds, onPositionUpdate, coordinateMapper, worldMapWidth, worldMapHeight, transform]
  );

  // Snap position to grid center when dragging ends
  const snapAndUpdate = useCallback(() => {
    if (lastPosition && gridSnapConfig?.gridData) {
      const snappedPosition = snapToGridCenter(
        lastPosition,
        gridSnapConfig.gridData,
        gridSnapConfig.gridScale ?? 1.0,
        gridSnapConfig.gridOffsetX ?? 0,
        gridSnapConfig.gridOffsetY ?? 0
      );
      onPositionUpdate(snappedPosition);
      setLastPosition(null);
    }
  }, [lastPosition, gridSnapConfig, onPositionUpdate]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Don't prevent default on right-click to allow context menu
    if (e.button === 2) {
      return;
    }
    // Don't prevent default immediately - let clicks pass through
    // We'll prevent default in mousemove if it becomes a drag
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
      // Prevent default only when actually dragging (not on initial mousedown)
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
    snapAndUpdate();
  }, [snapAndUpdate]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    snapAndUpdate();
  }, [snapAndUpdate]);

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


import { useState, useCallback } from "react";
import { ImageBounds, Position, TokenSize } from "../types";
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
  tokenSize?: TokenSize;
}

/**
 * Apply forward transform to screen coordinates using browser's built-in DOMMatrix API
 * This transforms untransformed coordinates to their visual position on screen
 */
const applyForwardTransform = (
  x: number,
  y: number,
  transform: TransformConfig,
  containerBounds: { left: number; top: number; width: number; height: number }
): { x: number; y: number } => {
  if (transform.scale === 1 && transform.translateX === 0 && transform.translateY === 0) {
    return { x, y };
  }

  // Get the center of the container (transform origin)
  const centerX = containerBounds.left + containerBounds.width / 2;
  const centerY = containerBounds.top + containerBounds.height / 2;

  // Create a DOMMatrix for the transform
  // CSS transform order: translate to center, scale, translate back, then apply pan
  const matrix = new DOMMatrix()
    .translate(centerX, centerY)           // Move to center
    .scale(transform.scale)                // Scale around center
    .translate(transform.translateX, transform.translateY) // Apply pan
    .translate(-centerX, -centerY);        // Move back

  // Apply forward transform to the point
  const point = new DOMPoint(x, y);
  const transformedPoint = point.matrixTransform(matrix);

  return {
    x: transformedPoint.x,
    y: transformedPoint.y,
  };
};

/**
 * Apply inverse transform to screen coordinates using browser's built-in DOMMatrix API
 * This is much simpler than manual math - the browser handles all the transform complexity
 */
const applyInverseTransform = (
  x: number,
  y: number,
  transform: TransformConfig,
  containerBounds: { left: number; top: number; width: number; height: number }
): { x: number; y: number } => {
  if (transform.scale === 1 && transform.translateX === 0 && transform.translateY === 0) {
    return { x, y };
  }

  // Get the center of the container (transform origin)
  const centerX = containerBounds.left + containerBounds.width / 2;
  const centerY = containerBounds.top + containerBounds.height / 2;

  // Create a DOMMatrix for the transform
  // CSS transform order: translate then scale around center
  // We need to: translate to center, scale, translate back, then apply pan
  const matrix = new DOMMatrix()
    .translate(centerX, centerY)           // Move to center
    .scale(transform.scale)                // Scale around center
    .translate(transform.translateX, transform.translateY) // Apply pan
    .translate(-centerX, -centerY);        // Move back

  // Get the inverse matrix (browser does the math for us!)
  const inverseMatrix = matrix.inverse();

  // Apply inverse transform to the point
  const point = new DOMPoint(x, y);
  const transformedPoint = point.matrixTransform(inverseMatrix);

  return {
    x: transformedPoint.x,
    y: transformedPoint.y,
  };
};

export const usePosition = (
  imageBounds: ImageBounds | null,
  onPositionUpdate: (position: Position) => void,
  worldMapWidth: number = 0,
  worldMapHeight: number = 0,
  transform?: TransformConfig,
  gridSnapConfig?: GridSnapConfig,
  currentPosition?: Position // Current token position for viewport-relative dragging
): UsePositionReturn => {
  const [isDragging, setIsDragging] = useState(false);
  const [lastPosition, setLastPosition] = useState<Position | null>(null);
  const [initialTokenScreenPos, setInitialTokenScreenPos] = useState<{ x: number; y: number } | null>(null);
  const [initialMousePos, setInitialMousePos] = useState<{ x: number; y: number } | null>(null);
  const coordinateMapper = useCoordinateMapper(
    imageBounds,
    worldMapWidth,
    worldMapHeight
  );

  const updatePosition = useCallback(
    (clientX: number, clientY: number): Position | null => {
      if (!imageBounds) return null;

      // If we have a transform (zoom/pan) and current position, use viewport-relative dragging
      // This makes the token follow the cursor/finger 1:1 on screen, regardless of zoom/pan level
      if (transform && (transform.scale !== 1 || transform.translateX !== 0 || transform.translateY !== 0) && currentPosition && initialTokenScreenPos && initialMousePos) {
        // Calculate delta from initial mouse position
        const deltaX = clientX - initialMousePos.x;
        const deltaY = clientY - initialMousePos.y;
        
        // Apply delta to initial token screen position (both in transformed space)
        const newTransformedScreenX = initialTokenScreenPos.x + deltaX;
        const newTransformedScreenY = initialTokenScreenPos.y + deltaY;
        
        // Convert from transformed screen space back to untransformed screen space
        const containerBounds = {
          left: imageBounds.containerLeft,
          top: imageBounds.containerTop,
          width: imageBounds.containerWidth,
          height: imageBounds.containerHeight,
        };
        const untransformedScreenPos = applyInverseTransform(
          newTransformedScreenX,
          newTransformedScreenY,
          transform,
          containerBounds
        );
        
        // Convert untransformed screen position to image-relative coordinates
        let position: Position | null = null;
        
        if (coordinateMapper.isReady && worldMapWidth > 0 && worldMapHeight > 0) {
          const screenPos = { x: untransformedScreenPos.x, y: untransformedScreenPos.y };
          const imageRelative = coordinateMapper.screenToImageRelative(screenPos);
          if (imageRelative) {
            position = { x: imageRelative.x, y: imageRelative.y };
          }
        } else {
          // Fallback to old system
          position = getImagePosition(untransformedScreenPos.x, untransformedScreenPos.y, imageBounds);
        }
        
        if (position) {
          // Store the position for snapping on release
          setLastPosition(position);
          // Don't snap during dragging, only update position
          onPositionUpdate(position);
          return position;
        }
        return null;
      }

      // Fallback to old behavior (no transform or no current position)
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
    [imageBounds, onPositionUpdate, coordinateMapper, worldMapWidth, worldMapHeight, transform, currentPosition, initialTokenScreenPos, initialMousePos]
  );

  // Snap position to grid center when dragging ends
  const snapAndUpdate = useCallback(() => {
    if (lastPosition && gridSnapConfig?.gridData) {
      const snappedPosition = snapToGridCenter(
        lastPosition,
        gridSnapConfig.gridData,
        gridSnapConfig.gridScale ?? 1.0,
        gridSnapConfig.gridOffsetX ?? 0,
        gridSnapConfig.gridOffsetY ?? 0,
        gridSnapConfig.tokenSize,
        imageBounds
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
    
    // Initialize drag state for viewport-relative dragging (only when transform is active)
    if (transform && (transform.scale !== 1 || transform.translateX !== 0 || transform.translateY !== 0) && currentPosition && imageBounds && coordinateMapper.isReady) {
      // Get the token's current screen position (untransformed)
      const imageRelative = { x: currentPosition.x, y: currentPosition.y };
      const untransformedScreenPos = coordinateMapper.imageRelativeToScreen(imageRelative);
      
      if (untransformedScreenPos) {
        // Apply forward transform to get the actual visual position on screen
        const containerBounds = {
          left: imageBounds.containerLeft,
          top: imageBounds.containerTop,
          width: imageBounds.containerWidth,
          height: imageBounds.containerHeight,
        };
        const visualScreenPos = applyForwardTransform(
          untransformedScreenPos.x,
          untransformedScreenPos.y,
          transform,
          containerBounds
        );
        
        setInitialTokenScreenPos(visualScreenPos);
        setInitialMousePos({ x: e.clientX, y: e.clientY });
      }
    }
    
    // Don't prevent default immediately - let clicks pass through
    // We'll prevent default in mousemove if it becomes a drag
    setIsDragging(true);
  }, [transform, currentPosition, imageBounds, coordinateMapper]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Initialize drag state for viewport-relative dragging (only when transform is active)
    const touch = e.touches[0];
    if (touch && transform && (transform.scale !== 1 || transform.translateX !== 0 || transform.translateY !== 0) && currentPosition && imageBounds && coordinateMapper.isReady) {
      // Get the token's current screen position (untransformed)
      const imageRelative = { x: currentPosition.x, y: currentPosition.y };
      const untransformedScreenPos = coordinateMapper.imageRelativeToScreen(imageRelative);
      
      if (untransformedScreenPos) {
        // Apply forward transform to get the actual visual position on screen
        const containerBounds = {
          left: imageBounds.containerLeft,
          top: imageBounds.containerTop,
          width: imageBounds.containerWidth,
          height: imageBounds.containerHeight,
        };
        const visualScreenPos = applyForwardTransform(
          untransformedScreenPos.x,
          untransformedScreenPos.y,
          transform,
          containerBounds
        );
        
        setInitialTokenScreenPos(visualScreenPos);
        setInitialMousePos({ x: touch.clientX, y: touch.clientY });
      }
    }
    
    setIsDragging(true);
  }, [transform, currentPosition, imageBounds, coordinateMapper]);

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
    setInitialTokenScreenPos(null);
    setInitialMousePos(null);
    snapAndUpdate();
  }, [snapAndUpdate]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    setInitialTokenScreenPos(null);
    setInitialMousePos(null);
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


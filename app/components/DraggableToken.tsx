import { useCallback, useEffect, useRef } from "react";
import { UserToken } from "./UserToken";
import { usePosition } from "../hooks/usePosition";
import { ImageBounds, Position } from "../types";

interface TransformConfig {
  scale: number;
  translateX: number;
  translateY: number;
}

interface DraggableTokenProps {
  tokenId: string;
  position: Position;
  color: string;
  imageBounds: ImageBounds | null;
  worldMapWidth?: number;
  worldMapHeight?: number;
  gridData?: {
    verticalLines: number[];
    horizontalLines: number[];
    imageWidth: number;
    imageHeight: number;
  };
  gridScale?: number;
  gridOffsetX?: number;
  gridOffsetY?: number;
  isMounted?: boolean;
  opacity?: number;
  title?: string;
  onClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onPositionUpdate: (tokenId: string, position: Position) => void;
  transform?: TransformConfig;
  onDragStateChange?: (tokenId: string, isDragging: boolean) => void;
  isInteractive?: boolean;
  zIndex?: number;
}

export const DraggableToken = ({
  tokenId,
  position,
  color,
  imageBounds,
  worldMapWidth = 0,
  worldMapHeight = 0,
  gridData,
  gridScale = 1.0,
  gridOffsetX = 0,
  gridOffsetY = 0,
  isMounted,
  opacity,
  title,
  onClick,
  onContextMenu,
  onPositionUpdate,
  transform,
  onDragStateChange,
  isInteractive = true,
  zIndex,
}: DraggableTokenProps) => {
  // Track initial mouse position to distinguish clicks from drags
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const hasMovedRef = useRef(false);
  // Track if we should prevent click events (only if we actually dragged)
  const shouldPreventClickRef = useRef(false);

  // Create a callback that updates this specific token's position
  const handlePositionUpdate = useCallback(
    (newPosition: Position) => {
      onPositionUpdate(tokenId, newPosition);
    },
    [tokenId, onPositionUpdate]
  );

  const {
    isDragging,
    handleMouseDown,
    handleTouchStart,
    handleMouseMove,
    handleTouchMove,
    handleMouseUp,
    handleTouchEnd,
  } = usePosition(
    imageBounds,
    handlePositionUpdate,
    worldMapWidth,
    worldMapHeight,
    transform,
    {
      gridData,
      gridScale,
      gridOffsetX,
      gridOffsetY,
    }
  );

  // Wrap handleMouseMove to track if mouse has moved (to distinguish click from drag)
  const wrappedHandleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragStartPosRef.current) {
        const dx = Math.abs(e.clientX - dragStartPosRef.current.x);
        const dy = Math.abs(e.clientY - dragStartPosRef.current.y);
        // If mouse moved more than 5 pixels, consider it a drag
        if (dx > 5 || dy > 5) {
          hasMovedRef.current = true;
          shouldPreventClickRef.current = true;
        }
      }
      handleMouseMove(e);
    },
    [handleMouseMove]
  );

  // Wrap handleMouseUp to allow clicks to fire if no drag occurred
  const wrappedHandleMouseUp = useCallback(() => {
    handleMouseUp();
    
    // Reset drag tracking (keep shouldPreventClickRef until click fires)
    dragStartPosRef.current = null;
    hasMovedRef.current = false;
    
    // Don't reset shouldPreventClickRef here - let handleClick reset it
    // This ensures we can distinguish between clicks and drags when click fires
  }, [handleMouseUp]);

  // Prevent dragging if not interactive, and handle clicks vs drags
  const handleInteractiveMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Don't start drag on right-click
      if (e.button === 2) {
        return;
      }
      
      if (!isInteractive) return;
      
      // Store initial position to detect if this is a click or drag
      dragStartPosRef.current = { x: e.clientX, y: e.clientY };
      hasMovedRef.current = false;
      shouldPreventClickRef.current = false;
      
      handleMouseDown(e);
    },
    [isInteractive, handleMouseDown]
  );

  // Wrap onClick to prevent it if we actually dragged
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Only prevent click if we actually dragged
      const shouldPrevent = shouldPreventClickRef.current;
      // Reset the flag now that we've checked it
      shouldPreventClickRef.current = false;
      
      if (shouldPrevent) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // Otherwise, let the onClick handler fire
      if (onClick) {
        onClick(e);
      }
    },
    [onClick]
  );

  const handleInteractiveTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!isInteractive) return;
      handleTouchStart(e);
    },
    [isInteractive, handleTouchStart]
  );

  // Notify parent of drag state changes
  useEffect(() => {
    if (onDragStateChange) {
      onDragStateChange(tokenId, isDragging);
    }
  }, [isDragging, tokenId, onDragStateChange]);

  // Store handlers in refs so we can attach them to document for global mouse tracking
  const handlersRef = useRef({
    handleMouseMove: wrappedHandleMouseMove,
    handleTouchMove,
    handleMouseUp: wrappedHandleMouseUp,
    handleTouchEnd,
  });

  useEffect(() => {
    handlersRef.current = {
      handleMouseMove: wrappedHandleMouseMove,
      handleTouchMove,
      handleMouseUp: wrappedHandleMouseUp,
      handleTouchEnd,
    };
  }, [wrappedHandleMouseMove, handleTouchMove, wrappedHandleMouseUp, handleTouchEnd]);

  // Attach global mouse/touch handlers when dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      // Convert native MouseEvent to React MouseEvent
      const reactEvent = {
        ...e,
        preventDefault: () => e.preventDefault(),
        stopPropagation: () => e.stopPropagation(),
        clientX: e.clientX,
        clientY: e.clientY,
      } as unknown as React.MouseEvent;
      handlersRef.current.handleMouseMove(reactEvent);
    };
    const handleGlobalTouchMove = (e: TouchEvent) => {
      // Convert native TouchEvent to React TouchEvent
      const reactEvent = {
        ...e,
        preventDefault: () => e.preventDefault(),
        stopPropagation: () => e.stopPropagation(),
        touches: e.touches,
      } as unknown as React.TouchEvent;
      handlersRef.current.handleTouchMove(reactEvent);
    };
    const handleGlobalMouseUp = () => {
      handlersRef.current.handleMouseUp();
    };
    const handleGlobalTouchEnd = () => {
      handlersRef.current.handleTouchEnd();
    };

    document.addEventListener("mousemove", handleGlobalMouseMove);
    document.addEventListener("touchmove", handleGlobalTouchMove, { passive: false });
    document.addEventListener("mouseup", handleGlobalMouseUp);
    document.addEventListener("touchend", handleGlobalTouchEnd);

    return () => {
      document.removeEventListener("mousemove", handleGlobalMouseMove);
      document.removeEventListener("touchmove", handleGlobalTouchMove);
      document.removeEventListener("mouseup", handleGlobalMouseUp);
      document.removeEventListener("touchend", handleGlobalTouchEnd);
    };
  }, [isDragging]);

  // Wrap onContextMenu handler
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (onContextMenu) {
        onContextMenu(e);
      }
    },
    [onContextMenu]
  );

  return (
    <UserToken
      position={position}
      color={color}
      imageBounds={imageBounds}
      worldMapWidth={worldMapWidth}
      worldMapHeight={worldMapHeight}
      gridData={gridData}
      gridScale={gridScale}
      isMounted={isMounted}
      opacity={opacity}
      title={title}
      isInteractive={isInteractive}
      onMouseDown={handleInteractiveMouseDown}
      onTouchStart={handleInteractiveTouchStart}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      zIndex={zIndex}
    />
  );
};


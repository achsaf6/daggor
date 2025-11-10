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
}: DraggableTokenProps) => {
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

  // Prevent dragging if not interactive
  const handleInteractiveMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isInteractive) return;
      handleMouseDown(e);
    },
    [isInteractive, handleMouseDown]
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
    handleMouseMove,
    handleTouchMove,
    handleMouseUp,
    handleTouchEnd,
  });

  useEffect(() => {
    handlersRef.current = {
      handleMouseMove,
      handleTouchMove,
      handleMouseUp,
      handleTouchEnd,
    };
  }, [handleMouseMove, handleTouchMove, handleMouseUp, handleTouchEnd]);

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
      onClick={onClick}
      onContextMenu={onContextMenu}
    />
  );
};


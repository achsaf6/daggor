"use client";

import React, { useCallback, useRef, useState } from "react";
import { Cover, ImageBounds } from "../../types";
import { useCoordinateMapper } from "../../hooks/useCoordinateMapper";

interface DraggableCoverProps {
  cover: Cover;
  imageBounds: ImageBounds | null;
  worldMapWidth: number;
  worldMapHeight: number;
  onPositionUpdate?: (id: string, x: number, y: number) => void;
  onSizeUpdate?: (id: string, width: number, height: number, x: number, y: number) => void;
  onRemoveCover?: (id: string) => void;
  isDraggable?: boolean;
}

export const DraggableCover = ({
  cover,
  imageBounds,
  worldMapWidth,
  worldMapHeight,
  onPositionUpdate,
  onSizeUpdate,
  onRemoveCover,
  isDraggable = true,
}: DraggableCoverProps) => {
  const coordinateMapper = useCoordinateMapper(imageBounds, worldMapWidth, worldMapHeight);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null); // 'nw', 'ne', 'sw', 'se'
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const coverStartPosRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const isInteractive = isDraggable && typeof onPositionUpdate === "function";
  const canResize = isDraggable && typeof onSizeUpdate === "function";

  if (!imageBounds || !coordinateMapper.isReady) {
    return null;
  }

  // Convert image-relative percentage to screen coordinates
  const topLeft = coordinateMapper.imageRelativeToScreen({
    x: cover.x,
    y: cover.y,
  });

  const bottomRight = coordinateMapper.imageRelativeToScreen({
    x: cover.x + cover.width,
    y: cover.y + cover.height,
  });

  if (!topLeft || !bottomRight) {
    return null;
  }

  const left = Math.min(topLeft.x, bottomRight.x);
  const top = Math.min(topLeft.y, bottomRight.y);
  const width = Math.abs(bottomRight.x - topLeft.x);
  const height = Math.abs(bottomRight.y - topLeft.y);

  if (!isInteractive || !onPositionUpdate) {
    return (
      <div
        data-cover
        className="absolute border-2 border-gray-400 pointer-events-none"
        style={{
          left: `${left}px`,
          top: `${top}px`,
          width: `${width}px`,
          height: `${height}px`,
          backgroundColor: cover.color || "#808080",
          zIndex: 5,
        }}
      />
    );
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) {
      return;
    }

    // Don't start dragging if clicking on a resize handle
    const target = e.target as HTMLElement;
    if (target.dataset.resizeHandle) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    coverStartPosRef.current = { x: cover.x, y: cover.y, width: cover.width, height: cover.height };
    setIsDragging(true);
  };

  const handleResizeMouseDown = (e: React.MouseEvent, corner: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    coverStartPosRef.current = { x: cover.x, y: cover.y, width: cover.width, height: cover.height };
    setIsResizing(corner);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!coordinateMapper.isReady || !dragStartRef.current || !coverStartPosRef.current) {
        return;
      }

      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;

      // Handle resizing
      if (isResizing && onSizeUpdate) {
        // Convert delta from screen pixels to image-relative percentage
        const deltaXPercent = (deltaX / imageBounds.width) * 100;
        const deltaYPercent = (deltaY / imageBounds.height) * 100;

        let newX = coverStartPosRef.current.x;
        let newY = coverStartPosRef.current.y;
        let newWidth = coverStartPosRef.current.width;
        let newHeight = coverStartPosRef.current.height;

        // Resize based on corner (opposite corner stays fixed)
        switch (isResizing) {
          case 'nw': // Top-left: bottom-right corner stays fixed
            newX = coverStartPosRef.current.x + deltaXPercent;
            newY = coverStartPosRef.current.y + deltaYPercent;
            newWidth = coverStartPosRef.current.width - deltaXPercent;
            newHeight = coverStartPosRef.current.height - deltaYPercent;
            break;
          case 'ne': // Top-right: bottom-left corner stays fixed
            newX = coverStartPosRef.current.x; // Keep left edge fixed
            newY = coverStartPosRef.current.y + deltaYPercent;
            newWidth = coverStartPosRef.current.width + deltaXPercent;
            newHeight = coverStartPosRef.current.height - deltaYPercent;
            break;
          case 'sw': // Bottom-left: top-right corner stays fixed
            newX = coverStartPosRef.current.x + deltaXPercent;
            newY = coverStartPosRef.current.y; // Keep top edge fixed
            newWidth = coverStartPosRef.current.width - deltaXPercent;
            newHeight = coverStartPosRef.current.height + deltaYPercent;
            break;
          case 'se': // Bottom-right: top-left corner stays fixed
            newX = coverStartPosRef.current.x; // Keep left edge fixed
            newY = coverStartPosRef.current.y; // Keep top edge fixed
            newWidth = coverStartPosRef.current.width + deltaXPercent;
            newHeight = coverStartPosRef.current.height + deltaYPercent;
            break;
        }

        // Clamp values to valid ranges
        const minSize = 1; // Minimum 1% size
        newWidth = Math.max(minSize, Math.min(100, newWidth));
        newHeight = Math.max(minSize, Math.min(100, newHeight));

        // Adjust position to ensure cover stays within bounds
        const maxX = 100 - newWidth;
        const maxY = 100 - newHeight;
        newX = Math.max(0, Math.min(maxX, newX));
        newY = Math.max(0, Math.min(maxY, newY));

        onSizeUpdate(cover.id, newWidth, newHeight, newX, newY);
        return;
      }

      // Handle dragging
      if (!isDragging || !onPositionUpdate) {
        return;
      }

      // Convert delta from screen pixels to image-relative percentage
      const deltaXPercent = (deltaX / imageBounds.width) * 100;
      const deltaYPercent = (deltaY / imageBounds.height) * 100;

      // Calculate new position
      let newX = coverStartPosRef.current.x + deltaXPercent;
      let newY = coverStartPosRef.current.y + deltaYPercent;

      // Clamp to image bounds
      newX = Math.max(0, Math.min(100 - cover.width, newX));
      newY = Math.max(0, Math.min(100 - cover.height, newY));

      onPositionUpdate(cover.id, newX, newY);
    },
    [isDragging, isResizing, coordinateMapper, imageBounds, cover.id, cover.width, cover.height, onPositionUpdate, onSizeUpdate]
  );

  const handleMouseUp = useCallback(
    () => {
      if (isResizing) {
        setIsResizing(null);
        dragStartRef.current = null;
        coverStartPosRef.current = null;
        return;
      }

      if (!isDragging) {
        return;
      }

      setIsDragging(false);
      dragStartRef.current = null;
      coverStartPosRef.current = null;
    },
    [isDragging, isResizing]
  );

  // Set up global mouse event listeners when dragging or resizing
  React.useEffect(() => {
    if (!isDragging && !isResizing) {
      return;
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!onRemoveCover) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (isDragging || isResizing) {
      return;
    }

    onRemoveCover(cover.id);
  };

  const handleSize = 8; // Size of resize handles in pixels

  return (
    <div
      data-cover
      className={`absolute border-2 pointer-events-auto transition-colors ${
        isDragging || isResizing
          ? "border-red-500 cursor-grabbing"
          : "border-gray-400 cursor-move hover:border-gray-300"
      }`}
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
        backgroundColor: cover.color || "#808080",
        zIndex: isDragging || isResizing ? 5 : 5,
      }}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      title="Drag to move, drag corners to resize, right-click to remove"
    >
      {canResize && (
        <>
          {/* Top-left corner - invisible but interactive */}
          <div
            data-resize-handle
            className="absolute cursor-nwse-resize"
            style={{
              left: `${-handleSize / 2}px`,
              top: `${-handleSize / 2}px`,
              width: `${handleSize}px`,
              height: `${handleSize}px`,
            }}
            onMouseDown={(e) => handleResizeMouseDown(e, 'nw')}
          />
          {/* Top-right corner - invisible but interactive */}
          <div
            data-resize-handle
            className="absolute cursor-nesw-resize"
            style={{
              right: `${-handleSize / 2}px`,
              top: `${-handleSize / 2}px`,
              width: `${handleSize}px`,
              height: `${handleSize}px`,
            }}
            onMouseDown={(e) => handleResizeMouseDown(e, 'ne')}
          />
          {/* Bottom-left corner - invisible but interactive */}
          <div
            data-resize-handle
            className="absolute cursor-nesw-resize"
            style={{
              left: `${-handleSize / 2}px`,
              bottom: `${-handleSize / 2}px`,
              width: `${handleSize}px`,
              height: `${handleSize}px`,
            }}
            onMouseDown={(e) => handleResizeMouseDown(e, 'sw')}
          />
          {/* Bottom-right corner - invisible but interactive */}
          <div
            data-resize-handle
            className="absolute cursor-nwse-resize"
            style={{
              right: `${-handleSize / 2}px`,
              bottom: `${-handleSize / 2}px`,
              width: `${handleSize}px`,
              height: `${handleSize}px`,
            }}
            onMouseDown={(e) => handleResizeMouseDown(e, 'se')}
          />
        </>
      )}
    </div>
  );
};



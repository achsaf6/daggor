"use client";

import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useSocket } from "../hooks/useSocket";
import { useImageBounds } from "../hooks/useImageBounds";
import { useSettings } from "../hooks/useSettings";
import { useCoordinateMapper } from "../hooks/useCoordinateMapper";
import { MapImage } from "./MapImage";
import { TokenManager } from "./TokenManager";
import { GridLines } from "./GridLines";
import { SidebarToolbar } from "./SidebarToolbar";
import { CoverManager } from "./CoverManager";
import { Position } from "../types";
import { snapToGridCenter } from "../utils/coordinates";
import { DEFAULT_GRID_DATA, GridData, fetchGridData } from "../utils/gridData";

export const MapViewDisplay = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    myUserId,
    otherUsers,
    disconnectedUsers,
    covers: socketCovers,
    updateTokenPosition,
    removeToken,
    addToken,
    addCover: emitAddCover,
    removeCover: emitRemoveCover,
    updateCover: emitUpdateCover,
  } = useSocket(true);
  const { imageBounds, updateBounds } = useImageBounds(containerRef);
  const { settings, setGridScale, setGridOffset, isLoading: settingsLoading } = useSettings();
  const [gridData, setGridData] = useState<GridData | null>(null);
  const [isGridLoading, setIsGridLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let isActive = true;

    setIsGridLoading(true);

    const loadGridlines = async () => {
      try {
        const data = await fetchGridData(controller.signal);
        if (!isActive) {
          return;
        }
        setGridData(data);
        setIsGridLoading(false);
      } catch (error) {
        if (!isActive) {
          return;
        }
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        console.error("Error fetching gridlines:", error);
        setGridData(DEFAULT_GRID_DATA);
        setIsGridLoading(false);
      }
    };

    loadGridlines();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, []);

  const displaySettings = settings;
  const effectiveGridData = gridData ?? DEFAULT_GRID_DATA;

  // Extract world map dimensions from gridData for coordinate mapping
  const worldMapWidth = effectiveGridData.imageWidth || 0;
  const worldMapHeight = effectiveGridData.imageHeight || 0;

  const coordinateMapper = useCoordinateMapper(imageBounds, worldMapWidth, worldMapHeight);

  // No transform for display mode
  const transform = { scale: 1, translateX: 0, translateY: 0 };

  // Drag state for token creation
  const [draggingColor, setDraggingColor] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);

  // Cover management
  const covers = useMemo(() => Array.from(socketCovers.values()), [socketCovers]);
  const [isSquareToolActive, setIsSquareToolActive] = useState(false);
  const [isSquareToolLocked, setIsSquareToolLocked] = useState(false);
  const [isDrawingSquare, setIsDrawingSquare] = useState(false);
  const [squareStartPos, setSquareStartPos] = useState<{ x: number; y: number } | null>(null);
  const [squareCurrentPos, setSquareCurrentPos] = useState<{ x: number; y: number } | null>(null);

  const resetSquareDrawing = useCallback(() => {
    setIsDrawingSquare(false);
    setSquareStartPos(null);
    setSquareCurrentPos(null);
  }, []);

  // Track mouse position during drag
  useEffect(() => {
    if (!draggingColor) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      setDragPosition({ x: e.clientX, y: e.clientY });
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      setDragPosition(null);
    };
  }, [draggingColor]);

  const handleTokenDragStart = (color: string) => {
    setDraggingColor(color);
  };

  const handleTokenDragEnd = () => {
    setDraggingColor(null);
    setDragPosition(null);
  };

  const handleSquareToolToggle = () => {
    if (isSquareToolLocked) {
      setIsSquareToolLocked(false);
      setIsSquareToolActive(false);
      resetSquareDrawing();
      return;
    }

    setIsSquareToolActive((prev) => {
      const next = !prev;
      if (!next) {
        resetSquareDrawing();
      }
      return next;
    });
  };

  const handleSquareToolLockToggle = () => {
    setIsSquareToolLocked((prev) => {
      const next = !prev;
      if (next) {
        setIsSquareToolActive(true);
      } else {
        setIsSquareToolActive(false);
        resetSquareDrawing();
      }
      return next;
    });
  };

  // Handle mouse events for drawing squares
  useEffect(() => {
    if (!isDrawingSquare || !squareStartPos || !coordinateMapper.isReady) {
      return;
    }

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const imageRelative = coordinateMapper.screenToImageRelative({
        x: e.clientX,
        y: e.clientY,
      });

      if (imageRelative) {
        setSquareCurrentPos({ x: imageRelative.x, y: imageRelative.y });
      }
    };

    const handleGlobalMouseUp = () => {
      if (!squareStartPos || !squareCurrentPos || !coordinateMapper.isReady) {
        resetSquareDrawing();
        return;
      }

      // Calculate square dimensions
      const minX = Math.min(squareStartPos.x, squareCurrentPos.x);
      const maxX = Math.max(squareStartPos.x, squareCurrentPos.x);
      const minY = Math.min(squareStartPos.y, squareCurrentPos.y);
      const maxY = Math.max(squareStartPos.y, squareCurrentPos.y);

      const width = maxX - minX;
      const height = maxY - minY;

      // Only create cover if it has meaningful size (at least 0.5% in each dimension)
      if (width > 0.5 && height > 0.5) {
        emitAddCover({
          x: minX,
          y: minY,
          width,
          height,
        });

        if (!isSquareToolLocked) {
          setIsSquareToolActive(false);
        }
      }

      resetSquareDrawing();
    };

    document.addEventListener("mousemove", handleGlobalMouseMove);
    document.addEventListener("mouseup", handleGlobalMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleGlobalMouseMove);
      document.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [
    isDrawingSquare,
    squareStartPos,
    squareCurrentPos,
    coordinateMapper,
    emitAddCover,
    isSquareToolLocked,
    resetSquareDrawing,
  ]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isSquareToolActive || !imageBounds || !coordinateMapper.isReady || draggingColor) {
      return;
    }

    // Don't start drawing if clicking on a cover (covers handle their own events)
    const target = e.target as HTMLElement;
    if (target.closest('[data-cover]')) {
      return;
    }

    e.preventDefault();
    const imageRelative = coordinateMapper.screenToImageRelative({
      x: e.clientX,
      y: e.clientY,
    });

    if (imageRelative) {
      setIsDrawingSquare(true);
      setSquareStartPos({ x: imageRelative.x, y: imageRelative.y });
      setSquareCurrentPos({ x: imageRelative.x, y: imageRelative.y });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    
    if (!draggingColor || !imageBounds || !coordinateMapper.isReady) {
      return;
    }

    const dropX = e.clientX;
    const dropY = e.clientY;

    const imageRelative = coordinateMapper.screenToImageRelative({
      x: dropX,
      y: dropY,
    });

    if (imageRelative) {
      let position: Position = {
        x: imageRelative.x,
        y: imageRelative.y,
      };

      if (effectiveGridData.imageWidth > 0 && effectiveGridData.imageHeight > 0) {
        position = snapToGridCenter(
          position,
          effectiveGridData,
          displaySettings.gridScale,
          displaySettings.gridOffsetX,
          displaySettings.gridOffsetY
        );
      }

      addToken(draggingColor, position);
    }

    handleTokenDragEnd();
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 m-0 p-0 overflow-hidden"
      style={{ 
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        MozUserSelect: "none",
        msUserSelect: "none",
      }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onMouseDown={handleMouseDown}
    >
      <SidebarToolbar
        gridScale={displaySettings.gridScale}
        onGridScaleChange={setGridScale}
        gridOffsetX={displaySettings.gridOffsetX}
        gridOffsetY={displaySettings.gridOffsetY}
        onGridOffsetChange={setGridOffset}
        onTokenDragStart={handleTokenDragStart}
        onTokenDragEnd={handleTokenDragEnd}
        onSquareToolToggle={handleSquareToolToggle}
        onSquareToolLockToggle={handleSquareToolLockToggle}
        isSquareToolActive={isSquareToolActive}
        isSquareToolLocked={isSquareToolLocked}
      />
      <MapImage onLoad={updateBounds} />
      <CoverManager
        covers={covers}
        imageBounds={imageBounds}
        worldMapWidth={worldMapWidth}
        worldMapHeight={worldMapHeight}
        isDraggable
        onRemoveCover={emitRemoveCover}
        onPositionUpdate={(id, x, y) => {
          emitUpdateCover(id, { x, y });
        }}
        onSizeUpdate={(id, width, height, x, y) => {
          emitUpdateCover(id, { width, height, x, y });
        }}
      />
      {imageBounds && !isGridLoading && !settingsLoading && gridData && (
        <GridLines
          gridData={effectiveGridData}
          imageBounds={imageBounds}
          gridScale={displaySettings.gridScale}
          gridOffsetX={displaySettings.gridOffsetX}
          gridOffsetY={displaySettings.gridOffsetY}
        />
      )}
      <TokenManager
        activeUsers={otherUsers}
        disconnectedUsers={disconnectedUsers}
        imageBounds={imageBounds}
        worldMapWidth={worldMapWidth}
        worldMapHeight={worldMapHeight}
        gridData={effectiveGridData}
        gridScale={displaySettings.gridScale}
        gridOffsetX={displaySettings.gridOffsetX}
        gridOffsetY={displaySettings.gridOffsetY}
        isMounted={true}
        isDisplay={true}
        myUserId={myUserId}
        onRemoveToken={removeToken}
        onPositionUpdate={updateTokenPosition}
        transform={transform}
        onDragStateChange={() => {}}
      />
      {/* Preview token while dragging */}
      {draggingColor && dragPosition && imageBounds && (
        <div
          className="fixed rounded-full border-2 border-white border-dashed shadow-lg z-30 pointer-events-none opacity-60"
          style={{
            left: `${dragPosition.x}px`,
            top: `${dragPosition.y}px`,
            width: "40px",
            height: "40px",
            transform: "translate(-50%, -50%)",
            backgroundColor: draggingColor,
          }}
        />
      )}
      {/* Preview square while drawing */}
      {isDrawingSquare && squareStartPos && squareCurrentPos && imageBounds && coordinateMapper.isReady && (
        (() => {
          const startScreen = coordinateMapper.imageRelativeToScreen(squareStartPos);
          const currentScreen = coordinateMapper.imageRelativeToScreen(squareCurrentPos);
          if (!startScreen || !currentScreen) return null;

          const left = Math.min(startScreen.x, currentScreen.x);
          const top = Math.min(startScreen.y, currentScreen.y);
          const width = Math.abs(currentScreen.x - startScreen.x);
          const height = Math.abs(currentScreen.y - startScreen.y);

          return (
            <div
              className="fixed border-2 border-blue-400 border-dashed shadow-lg z-30 pointer-events-none opacity-70"
              style={{
                left: `${left}px`,
                top: `${top}px`,
                width: `${width}px`,
                height: `${height}px`,
                backgroundColor: "rgba(59, 130, 246, 0.2)",
              }}
            />
          );
        })()
      )}
    </div>
  );
};

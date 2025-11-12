"use client";

import React, { useRef, useState, useEffect } from "react";
import { useSocket } from "../hooks/useSocket";
import { useImageBounds } from "../hooks/useImageBounds";
import { useGridlines } from "../hooks/useGridlines";
import { useSettings } from "../hooks/useSettings";
import { useCoordinateMapper } from "../hooks/useCoordinateMapper";
import { MapImage } from "./MapImage";
import { TokenManager } from "./TokenManager";
import { GridLines } from "./GridLines";
import { SidebarToolbar } from "./SidebarToolbar";
import { Position } from "../types";
import { snapToGridCenter } from "../utils/coordinates";

export const MapViewDisplay = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { myUserId, otherUsers, disconnectedUsers, updateTokenPosition, removeToken, addToken } = useSocket(true);
  const { imageBounds, updateBounds } = useImageBounds(containerRef);
  const { gridData, settings: gridSettings } = useGridlines();
  const { settings, setGridScale, setGridOffset, isLoading: settingsLoading } = useSettings();
  
  // Use synchronized settings from useGridlines initially to prevent visual jump
  // Once settings are loaded from useSettings, use those (they handle updates)
  // This ensures gridlines and settings load together, then updates work correctly
  const displaySettings = (!settingsLoading) ? settings : (gridSettings || settings);

  // Extract world map dimensions from gridData for coordinate mapping
  const worldMapWidth = gridData.imageWidth || 0;
  const worldMapHeight = gridData.imageHeight || 0;

  const coordinateMapper = useCoordinateMapper(imageBounds, worldMapWidth, worldMapHeight);

  // No transform for display mode
  const transform = { scale: 1, translateX: 0, translateY: 0 };

  // Drag state for token creation
  const [draggingColor, setDraggingColor] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);

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

      if (gridData && gridData.imageWidth > 0 && gridData.imageHeight > 0) {
        position = snapToGridCenter(
          position,
          gridData,
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
    >
      <SidebarToolbar
        gridScale={displaySettings.gridScale}
        onGridScaleChange={setGridScale}
        gridOffsetX={displaySettings.gridOffsetX}
        gridOffsetY={displaySettings.gridOffsetY}
        onGridOffsetChange={setGridOffset}
        onTokenDragStart={handleTokenDragStart}
        onTokenDragEnd={handleTokenDragEnd}
      />
      <MapImage onLoad={updateBounds} />
      {imageBounds && (
        <GridLines
          gridData={gridData}
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
        gridData={gridData}
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
    </div>
  );
};

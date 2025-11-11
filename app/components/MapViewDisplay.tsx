"use client";

import React, { useRef } from "react";
import { useSocket } from "../hooks/useSocket";
import { useImageBounds } from "../hooks/useImageBounds";
import { useGridlines } from "../hooks/useGridlines";
import { useSettings } from "../hooks/useSettings";
import { MapImage } from "./MapImage";
import { TokenManager } from "./TokenManager";
import { GridLines } from "./GridLines";
import { SidebarToolbar } from "./SidebarToolbar";

export const MapViewDisplay = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { myUserId, otherUsers, disconnectedUsers, updateTokenPosition, removeToken } = useSocket(true);
  const { imageBounds, updateBounds } = useImageBounds(containerRef);
  const { gridData } = useGridlines();
  const { settings, setGridScale, setGridOffset } = useSettings();

  // Extract world map dimensions from gridData for coordinate mapping
  const worldMapWidth = gridData.imageWidth || 0;
  const worldMapHeight = gridData.imageHeight || 0;

  // No transform for display mode
  const transform = { scale: 1, translateX: 0, translateY: 0 };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 m-0 p-0 overflow-hidden"
      style={{ touchAction: "none" }}
    >
      <SidebarToolbar
        gridScale={settings.gridScale}
        onGridScaleChange={setGridScale}
        gridOffsetX={settings.gridOffsetX}
        gridOffsetY={settings.gridOffsetY}
        onGridOffsetChange={setGridOffset}
      />
      <MapImage onLoad={updateBounds} />
      {imageBounds && (
        <GridLines
          gridData={gridData}
          imageBounds={imageBounds}
          gridScale={settings.gridScale}
          gridOffsetX={settings.gridOffsetX}
          gridOffsetY={settings.gridOffsetY}
        />
      )}
      <TokenManager
        activeUsers={otherUsers}
        disconnectedUsers={disconnectedUsers}
        imageBounds={imageBounds}
        worldMapWidth={worldMapWidth}
        worldMapHeight={worldMapHeight}
        gridData={gridData}
        gridScale={settings.gridScale}
        gridOffsetX={settings.gridOffsetX}
        gridOffsetY={settings.gridOffsetY}
        isMounted={true}
        isDisplay={true}
        myUserId={myUserId}
        onRemoveToken={removeToken}
        onPositionUpdate={updateTokenPosition}
        transform={transform}
        onDragStateChange={() => {}}
      />
    </div>
  );
};


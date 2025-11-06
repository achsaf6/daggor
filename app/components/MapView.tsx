"use client";

import { useRef } from "react";
import { useSocket } from "../hooks/useSocket";
import { useImageBounds } from "../hooks/useImageBounds";
import { usePosition } from "../hooks/usePosition";
import { useGridlines } from "../hooks/useGridlines";
import { MapImage } from "./MapImage";
import { UserCircle } from "./UserCircle";
import { UserCircles } from "./UserCircles";
import { GridLines } from "./GridLines";

export const MapView = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { myColor, myPosition, otherUsers, updateMyPosition } = useSocket();
  const { imageBounds, updateBounds } = useImageBounds(containerRef);
  const { gridData } = useGridlines();

  const {
    handleMouseDown,
    handleTouchStart,
    handleMouseMove,
    handleTouchMove,
    handleMouseUp,
    handleTouchEnd,
  } = usePosition(imageBounds, updateMyPosition);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 m-0 p-0 overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={(e) => {
        // Prevent clicks on background
        if (
          e.target === e.currentTarget ||
          (e.target as HTMLElement).tagName === "IMG"
        ) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      style={{ touchAction: "none" }}
    >
      <MapImage onLoad={updateBounds} />
      {imageBounds && gridData && (
        <GridLines gridData={gridData} imageBounds={imageBounds} />
      )}
      {imageBounds && (
        <UserCircle
          position={myPosition}
          color={myColor}
          imageBounds={imageBounds}
          isInteractive={true}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        />
      )}
      <UserCircles users={otherUsers} imageBounds={imageBounds} />
    </div>
  );
};


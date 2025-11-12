"use client";

import React from "react";
import { Cover, ImageBounds } from "../types";
import { DraggableCover } from "./DraggableCover";

interface CoverManagerProps {
  covers: Cover[];
  imageBounds: ImageBounds | null;
  worldMapWidth: number;
  worldMapHeight: number;
  onRemoveCover?: (id: string) => void;
  onPositionUpdate?: (id: string, x: number, y: number) => void;
  onSizeUpdate?: (id: string, width: number, height: number, x: number, y: number) => void;
  isDraggable?: boolean;
}

export const CoverManager = ({
  covers,
  imageBounds,
  worldMapWidth,
  worldMapHeight,
  onRemoveCover,
  onPositionUpdate,
  onSizeUpdate,
  isDraggable = false,
}: CoverManagerProps) => {
  if (!imageBounds || covers.length === 0) {
    return null;
  }

  return (
    <>
      {covers.map((cover) => (
        <DraggableCover
          key={cover.id}
          cover={cover}
          imageBounds={imageBounds}
          worldMapWidth={worldMapWidth}
          worldMapHeight={worldMapHeight}
          isDraggable={isDraggable}
          onPositionUpdate={isDraggable ? onPositionUpdate : undefined}
          onSizeUpdate={isDraggable ? onSizeUpdate : undefined}
          onRemoveCover={isDraggable ? onRemoveCover : undefined}
        />
      ))}
    </>
  );
};


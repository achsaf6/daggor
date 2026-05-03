"use client";

import { useCallback, useRef, useState } from "react";
import { ImageBounds } from "../../types";
import { FogShape } from "./FogOfWar";
import { useDrag } from "../../hooks/useDrag";
import { useCoordinateMapper } from "../../hooks/useCoordinateMapper";

interface FogManagerProps {
  shapes: FogShape[];
  imageBounds: ImageBounds;
  worldMapWidth: number;
  worldMapHeight: number;
  isToolActive: boolean;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, x: number, y: number, width: number, height: number) => void;
  onRemove: (id: string) => void;
}

// Dashboard-only fog interaction layer. Renders an invisible interactive
// rectangle on top of every fog shape; when the fog tool is active the GM
// can drag it to reposition, drag a corner to resize, or right-click to
// remove. The visual fog itself comes from <FogOfWar/>; this layer is
// purely for interaction.
//
// We render this on top of the static FogOfWar SVG so all fog manipulation
// happens through the same coordinate model. Players see only FogOfWar
// (read-only); the GM sees both layers stacked.
export const FogManager = ({
  shapes,
  imageBounds,
  worldMapWidth,
  worldMapHeight,
  isToolActive,
  onMove,
  onResize,
  onRemove,
}: FogManagerProps) => {
  const coordinateMapper = useCoordinateMapper(imageBounds, worldMapWidth, worldMapHeight);

  if (!coordinateMapper.isReady) return null;

  // The handles are gated by isToolActive — when the fog tool isn't on, we
  // don't render anything (the user shouldn't accidentally grab fog while
  // moving tokens).
  if (!isToolActive) return null;

  return (
    <>
      {shapes.map((shape) => (
        <DraggableFogShape
          key={shape.id}
          shape={shape}
          imageBounds={imageBounds}
          coordinateMapper={coordinateMapper}
          onMove={onMove}
          onResize={onResize}
          onRemove={onRemove}
        />
      ))}
    </>
  );
};

type ResizeCorner = "nw" | "ne" | "sw" | "se";
const HANDLE_PX = 12;

interface DraggableFogShapeProps {
  shape: FogShape;
  imageBounds: ImageBounds;
  coordinateMapper: ReturnType<typeof useCoordinateMapper>;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, x: number, y: number, width: number, height: number) => void;
  onRemove: (id: string) => void;
}

const DraggableFogShape = ({
  shape,
  imageBounds,
  coordinateMapper,
  onMove,
  onResize,
  onRemove,
}: DraggableFogShapeProps) => {
  const [resizeCorner, setResizeCorner] = useState<ResizeCorner | null>(null);
  // Snapshot of the shape at drag-start so deltas stay accumulated against a
  // stable origin, not the live shape (which changes as we emit moves).
  const startSnapshotRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  const handleMove = useCallback(
    (deltaX: number, deltaY: number) => {
      const start = startSnapshotRef.current;
      if (!start) return;

      const deltaXPercent = (deltaX / imageBounds.width) * 100;
      const deltaYPercent = (deltaY / imageBounds.height) * 100;

      if (resizeCorner) {
        let nx = start.x;
        let ny = start.y;
        let nw = start.width;
        let nh = start.height;

        switch (resizeCorner) {
          case "nw":
            nx = start.x + deltaXPercent;
            ny = start.y + deltaYPercent;
            nw = start.width - deltaXPercent;
            nh = start.height - deltaYPercent;
            break;
          case "ne":
            ny = start.y + deltaYPercent;
            nw = start.width + deltaXPercent;
            nh = start.height - deltaYPercent;
            break;
          case "sw":
            nx = start.x + deltaXPercent;
            nw = start.width - deltaXPercent;
            nh = start.height + deltaYPercent;
            break;
          case "se":
            nw = start.width + deltaXPercent;
            nh = start.height + deltaYPercent;
            break;
        }

        const minSize = 1;
        nw = Math.max(minSize, Math.min(100, nw));
        nh = Math.max(minSize, Math.min(100, nh));
        nx = Math.max(0, Math.min(100 - nw, nx));
        ny = Math.max(0, Math.min(100 - nh, ny));
        onResize(shape.id, nx, ny, nw, nh);
        return;
      }

      const newX = Math.max(0, Math.min(100 - shape.width, start.x + deltaXPercent));
      const newY = Math.max(0, Math.min(100 - shape.height, start.y + deltaYPercent));
      onMove(shape.id, newX, newY);
    },
    [imageBounds.width, imageBounds.height, resizeCorner, shape.id, shape.width, shape.height, onMove, onResize]
  );

  const handleEnd = useCallback(() => {
    setResizeCorner(null);
    startSnapshotRef.current = null;
  }, []);

  const { isDragging, start } = useDrag({ onMove: handleMove, onEnd: handleEnd });

  const tl = coordinateMapper.imageRelativeToScreen({ x: shape.x, y: shape.y });
  const br = coordinateMapper.imageRelativeToScreen({
    x: shape.x + shape.width,
    y: shape.y + shape.height,
  });
  if (!tl || !br) return null;

  const left = Math.min(tl.x, br.x);
  const top = Math.min(tl.y, br.y);
  const width = Math.abs(br.x - tl.x);
  const height = Math.abs(br.y - tl.y);

  const snapshot = () => {
    startSnapshotRef.current = {
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height,
    };
  };

  const onBodyMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.dataset.fogResizeHandle) return;
    e.preventDefault();
    e.stopPropagation();
    snapshot();
    setResizeCorner(null);
    start(e);
  };

  const onResizeMouseDown = (e: React.MouseEvent, corner: ResizeCorner) => {
    e.preventDefault();
    e.stopPropagation();
    snapshot();
    setResizeCorner(corner);
    start(e);
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDragging) return;
    onRemove(shape.id);
  };

  // Body: invisible but interactive. The visible fog comes from the SVG
  // mist layer in <FogOfWar/>. Outline shows on hover so the GM knows it's
  // grabbable; outline fades when not hovered so the canvas isn't busy.
  return (
    <div
      data-fog-handle
      className="absolute group cursor-move"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
        zIndex: 9, // sits above FogOfWar (z 8), below tokens (z 10/20)
      }}
      onMouseDown={onBodyMouseDown}
      onContextMenu={onContextMenu}
      title="Drag to move · drag corners to resize · right-click to remove"
    >
      <div
        className={`absolute inset-0 rounded-sm border-2 transition-colors ${
          isDragging
            ? "border-[var(--color-chart-4)]"
            : "border-[var(--color-chart-4)]/0 group-hover:border-[var(--color-chart-4)]/70"
        }`}
        aria-hidden
      />
      {(["nw", "ne", "sw", "se"] as ResizeCorner[]).map((corner) => (
        <div
          key={corner}
          data-fog-handle
          data-fog-resize-handle
          className={`absolute h-3 w-3 rounded-sm border-2 border-[var(--color-chart-4)] bg-background opacity-0 group-hover:opacity-100 transition-opacity ${
            corner === "nw"
              ? "-top-1.5 -left-1.5 cursor-nwse-resize"
              : corner === "ne"
              ? "-top-1.5 -right-1.5 cursor-nesw-resize"
              : corner === "sw"
              ? "-bottom-1.5 -left-1.5 cursor-nesw-resize"
              : "-bottom-1.5 -right-1.5 cursor-nwse-resize"
          }`}
          style={{ width: HANDLE_PX, height: HANDLE_PX }}
          onMouseDown={(e) => onResizeMouseDown(e, corner)}
        />
      ))}
    </div>
  );
};

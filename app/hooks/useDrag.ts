"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseDragOptions {
  // Called every mousemove/touchmove with the delta in screen pixels from the
  // point where the drag started. The caller is expected to translate that
  // delta into whatever coordinate system it cares about.
  onMove: (deltaX: number, deltaY: number) => void;
  // Optional teardown when the drag/release ends.
  onEnd?: () => void;
}

interface DragOriginalEvent {
  clientX: number;
  clientY: number;
}

const eventCoords = (e: MouseEvent | TouchEvent): DragOriginalEvent | null => {
  if ("touches" in e) {
    const t = e.touches[0] ?? e.changedTouches[0];
    return t ? { clientX: t.clientX, clientY: t.clientY } : null;
  }
  return { clientX: e.clientX, clientY: e.clientY };
};

// Shared drag state machine for percentage/screen-pixel based drags.
// DraggableToken has its own usePosition hook that handles its richer needs
// (long-press, snap-to-grid, transform compensation, click-vs-drag); this hook
// is the simpler primitive used by DraggableFogShape and any future drag UI
// (e.g. spawn-area resize handles, fog-of-war shape edits) so they don't
// reinvent global-listener wiring.
export const useDrag = ({ onMove, onEnd }: UseDragOptions) => {
  const [isDragging, setIsDragging] = useState(false);
  const originRef = useRef<DragOriginalEvent | null>(null);
  // Always read the latest callbacks to avoid stale-closure bugs when listeners
  // attached at drag-start fire after the parent re-renders.
  const onMoveRef = useRef(onMove);
  const onEndRef = useRef(onEnd);
  onMoveRef.current = onMove;
  onEndRef.current = onEnd;

  const start = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const origin =
      "touches" in e
        ? e.touches[0] ?? e.changedTouches[0]
        : { clientX: e.clientX, clientY: e.clientY };
    if (!origin) return;
    originRef.current = { clientX: origin.clientX, clientY: origin.clientY };
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const point = eventCoords(e);
      const origin = originRef.current;
      if (!point || !origin) return;
      onMoveRef.current(point.clientX - origin.clientX, point.clientY - origin.clientY);
    };

    const handleEnd = () => {
      setIsDragging(false);
      originRef.current = null;
      onEndRef.current?.();
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleEnd);
    document.addEventListener("touchmove", handleMove);
    document.addEventListener("touchend", handleEnd);
    document.addEventListener("touchcancel", handleEnd);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleEnd);
      document.removeEventListener("touchmove", handleMove);
      document.removeEventListener("touchend", handleEnd);
      document.removeEventListener("touchcancel", handleEnd);
    };
  }, [isDragging]);

  return { isDragging, start };
};

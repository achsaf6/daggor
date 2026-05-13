"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

interface Placement {
  /** Distance from viewport left edge, px */
  left: number;
  /** Distance from viewport top edge, px */
  top: number;
  /** Hard cap on flyout height so it never exceeds the viewport */
  maxHeight: number;
}

interface Options {
  /** Soft floor for the available height. If aligning the flyout's top with
   *  the trigger would leave less than `minHeight` of room above the
   *  viewport bottom, the flyout shifts up so this much space is available.
   *  In practice: tall flyouts (Maps, Settings) pass ~360–400; short ones
   *  (Floor picker) can pass 120 and stay glued to the trigger. */
  minHeight?: number;
  /** Horizontal gap between the trigger's right edge and the flyout's left
   *  edge. Matches Tailwind's `ml-2` (8px) by default. */
  gap?: number;
  /** Outer viewport padding kept clear of the flyout. Default 16. */
  margin?: number;
}

// Returns viewport-fixed coordinates for a flyout that should anchor to a
// trigger but never overflow the screen. The previous implementation used
// `position: absolute; top: 0` relative to the trigger, which meant tall
// flyouts (BattlemapManager) extended below the viewport when the trigger
// sat low in the toolbar — bottom actions became unreachable.
//
// Algorithm:
//   1. Try to align the flyout's top with the trigger's top.
//   2. If that would leave less than `minHeight` of viewport space below,
//      shift the top up just enough to give the flyout `minHeight` to grow
//      into. Never shift above the viewport top margin.
//   3. Cap `maxHeight` at the remaining space below the chosen top.
//
// The flyout itself should use `position: fixed` and an inner scroll
// container so its content scrolls without growing the panel.
export const useClampedFlyoutPlacement = (
  triggerRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  options?: Options
): Placement | null => {
  const minHeight = options?.minHeight ?? 200;
  const gap = options?.gap ?? 8;
  const margin = options?.margin ?? 16;
  const [placement, setPlacement] = useState<Placement | null>(null);

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) {
      setPlacement(null);
      return;
    }

    const update = () => {
      const node = triggerRef.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      const vh = window.innerHeight;

      // Highest position the flyout's top can take and still fit minHeight.
      const maxTop = Math.max(margin, vh - margin - minHeight);
      const desiredTop = r.top;
      const top = Math.max(margin, Math.min(desiredTop, maxTop));
      const maxHeight = vh - top - margin;
      setPlacement({ left: r.right + gap, top, maxHeight });
    };

    update();
    // Resize and scroll both move the trigger; recompute on either.
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [isOpen, triggerRef, minHeight, gap, margin]);

  return placement;
};

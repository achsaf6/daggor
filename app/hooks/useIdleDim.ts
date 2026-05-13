"use client";

import { useEffect, useRef, useState } from "react";

// Returns `isIdle = true` after `idleMs` of no pointer movement, no key press,
// and no mouse button. Resets on any of those events. The Glass Atelier
// dashboard uses this to fade panels back to ~40% opacity when the GM hasn't
// touched anything in a while — map dominates between turns.
//
// We deliberately watch *document* events so it survives the panels being
// invisible (you can wave the mouse over the map to wake them).
export const useIdleDim = (idleMs = 4000): boolean => {
  const [isIdle, setIsIdle] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const wake = () => {
      setIsIdle(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setIsIdle(true), idleMs);
    };

    // Prime: start in non-idle, schedule the first transition.
    wake();

    const passive: AddEventListenerOptions = { passive: true };
    window.addEventListener("mousemove", wake, passive);
    window.addEventListener("mousedown", wake, passive);
    window.addEventListener("keydown", wake, passive);
    window.addEventListener("touchstart", wake, passive);
    window.addEventListener("wheel", wake, passive);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("mousedown", wake);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("touchstart", wake);
      window.removeEventListener("wheel", wake);
    };
  }, [idleMs]);

  return isIdle;
};

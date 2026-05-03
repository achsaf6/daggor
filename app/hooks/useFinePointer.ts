"use client";

import { useEffect, useState } from "react";

// True when the device reports a precise pointing device with hover capability
// (i.e. a mouse or trackpad). Used to gate DM surfaces — phones and tablets
// without a mouse should not be running /dashboard or /display.
//
// Returns null until mounted so callers can render a neutral UI on the server
// and avoid a hydration flash.
export const useFinePointer = (): boolean | null => {
  const [hasFinePointer, setHasFinePointer] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      setHasFinePointer(false);
      return;
    }
    const mql = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setHasFinePointer(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return hasFinePointer;
};

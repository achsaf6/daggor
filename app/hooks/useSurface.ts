"use client";

import { createContext, useContext } from "react";

// The "surface" a client is rendering. The route owns the value and provides it
// via SurfaceProvider; everything downstream reads it via useSurface().
export type Surface = "mobile" | "display" | "dashboard";

const SurfaceContext = createContext<Surface>("mobile");

export const SurfaceProvider = SurfaceContext.Provider;

export const useSurface = (): Surface => useContext(SurfaceContext);

// Both "display" and "dashboard" are DM-trusted surfaces — only the DM's
// laptop should be on either of those routes. Centralised so callers do not
// hand-roll the same check.
export const isDmSurface = (surface: Surface): boolean =>
  surface === "display" || surface === "dashboard";

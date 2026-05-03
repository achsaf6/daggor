"use client";

import { memo, useId } from "react";
import { ImageBounds } from "../../types";
import { getRelativeImageOffsets } from "./GridLines";

export interface FogShape {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FogOfWarProps {
  shapes: FogShape[];
  imageBounds: ImageBounds | null;
  // Dashboard renders the fog at low opacity so the GM can plan; display and
  // mobile render it fully opaque so players can't see through. The body of
  // each fog shape is 100% opaque on player surfaces — only the feathered
  // edge zone (Gaussian blur radius) fades to clear.
  opacity?: number;
}

// Fog ONLY inside drawn shapes. Empty `shapes` = fully visible map
// (default-open). Drag with the fog tool adds a shape; click an existing
// shape removes it.
//
// Implementation:
//   1. A mask whose default state is BLACK (no fog) and which becomes WHITE
//      inside each drawn shape (fog visible) — mask shapes are blurred so
//      edges feather smoothly.
//   2. A fully opaque dark rect masked by (1) — the body of each fog area
//      is 100% opaque; players cannot see the map through it.
//   3. A noise-textured rect masked by (1) — adds wispy mist on top of the
//      opaque body so the fog reads atmospheric, not flat black.
//
// Static — Restrained motion direction.
const FogOfWarInner = ({ shapes, imageBounds, opacity = 1 }: FogOfWarProps) => {
  const maskId = useId();
  const mistId = useId();
  const softenId = useId();

  if (!imageBounds || shapes.length === 0) return null;

  const offsets = getRelativeImageOffsets(imageBounds);

  return (
    <svg
      className="absolute pointer-events-none"
      style={{
        left: `${offsets.left}px`,
        top: `${offsets.top}px`,
        width: `${imageBounds.width}px`,
        height: `${imageBounds.height}px`,
        zIndex: 8,
        opacity,
      }}
      preserveAspectRatio="none"
      data-testid="fog-overlay"
      data-fog-shape-count={shapes.length}
    >
      <defs>
        {/* Wispy noise tinted dark blue-gray. Sits on top of the opaque base
            to give the fog atmosphere without reducing coverage. */}
        <filter id={mistId} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.014 0.02"
            numOctaves="3"
            seed="11"
            result="noise"
          />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0.36
                    0 0 0 0 0.42
                    0 0 0 0 0.52
                    0 0 0 0.55 0"
          />
        </filter>

        {/* Soft Gaussian blur on the mask shapes so fog edges feather into
            the visible map across ~12px instead of cutting hard rectangles. */}
        <filter id={softenId}>
          <feGaussianBlur stdDeviation="6" />
        </filter>

        <mask id={maskId}>
          {/* Black base = no fog by default; the map is fully visible. */}
          <rect width="100%" height="100%" fill="black" />
          {/* White, blurred = fog appears here, with feathered edges. */}
          <g filter={`url(#${softenId})`}>
            {shapes.map((s) => (
              <rect
                key={s.id}
                x={`${s.x}%`}
                y={`${s.y}%`}
                width={`${s.width}%`}
                height={`${s.height}%`}
                fill="white"
              />
            ))}
          </g>
        </mask>
      </defs>

      {/* Body: fully opaque dark blue-gray inside fog shapes. The feathered
          mask edges still attenuate the alpha smoothly, so the perimeter
          fades to clear — but anywhere a player can perceive as "inside
          the fog" is 100% opaque. */}
      <rect
        width="100%"
        height="100%"
        fill="rgb(8, 12, 22)"
        mask={`url(#${maskId})`}
      />
      {/* Mist texture layered on top of the opaque body — pure atmosphere,
          adds no transparency to the fog body. */}
      <rect
        width="100%"
        height="100%"
        filter={`url(#${mistId})`}
        mask={`url(#${maskId})`}
      />
    </svg>
  );
};

export const FogOfWar = memo(FogOfWarInner);
FogOfWar.displayName = "FogOfWar";

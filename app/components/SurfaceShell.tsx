"use client";

import dynamic from "next/dynamic";
import { Surface, SurfaceProvider, isDmSurface } from "../hooks/useSurface";
import { BattlemapProvider } from "../providers/BattlemapProvider";
import { CharacterProvider } from "../providers/CharacterProvider";
import { useFinePointer } from "../hooks/useFinePointer";

// MapView reads from the SurfaceProvider, so it must be mounted inside it.
// Dynamic-import keeps SSR off (preserves the previous "ssr: false" behavior
// from app/page.tsx).
const MapView = dynamic(
  () => import("./MapView/MapView").then((m) => m.MapView),
  { ssr: false }
);

interface SurfaceShellProps {
  surface: Surface;
}

// One shell per route. It scopes the surface, mounts providers, and gates
// DM surfaces behind a "this needs a computer" warning when the device has no
// fine pointer (i.e. no mouse or trackpad).
export const SurfaceShell = ({ surface }: SurfaceShellProps) => {
  const hasFinePointer = useFinePointer();
  const isDm = isDmSurface(surface);

  // hasFinePointer is null until the matchMedia query has resolved on the
  // client. Render nothing on the server / first paint so we don't flash an
  // incorrect warning, then resolve to either the surface UI or the warning.
  if (isDm && hasFinePointer === false) {
    return <DmSurfaceWarning surface={surface} />;
  }

  return (
    <SurfaceProvider value={surface}>
      <BattlemapProvider>
        <CharacterProvider>
          <MapView surface={surface} />
        </CharacterProvider>
      </BattlemapProvider>
    </SurfaceProvider>
  );
};

const DmSurfaceWarning = ({ surface }: { surface: Surface }) => (
  <div className="fixed inset-0 flex items-center justify-center bg-background p-6 text-center">
    <div className="relative z-10 max-w-md space-y-4 text-foreground">
      <p className="text-[11px] uppercase tracking-[0.4em] text-muted-foreground">
        Daggor &mdash; {surface}
      </p>
      <p className="text-2xl font-bold tracking-tight">Open this on a computer</p>
      <p className="text-sm text-muted-foreground">
        The {surface} surface is meant for the GM&apos;s laptop. From a phone or
        tablet, open the player view at <code className="font-mono">/</code> instead.
      </p>
      <a
        href="/"
        className="inline-block rounded-md bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Go to player view
      </a>
    </div>
  </div>
);

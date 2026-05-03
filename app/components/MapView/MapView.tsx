"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Surface } from "../../hooks/useSurface";
import { MapViewDisplay } from "./MapViewDisplay";
import { MapViewMobile } from "./MapViewMobile";
import { LoadingScreen } from "./LoadingScreen";
import { useCharacter } from "../../providers/CharacterProvider";

interface MapViewProps {
  surface: Surface;
}

// Routed entry point. The surface is decided by the URL (see /, /display,
// /dashboard) and provided via SurfaceProvider higher up the tree; this
// component just chooses the right view and handles the loading screen.
export const MapView = ({ surface }: MapViewProps) => {
  const { hasSelectedCharacter } = useCharacter();
  const [isMapReady, setIsMapReady] = useState(false);
  const [hasClickedEnter, setHasClickedEnter] = useState(false);

  const handleReadyChange = useCallback((ready: boolean) => {
    setIsMapReady(ready);
  }, []);

  const handleEnterClick = useCallback(() => {
    setHasClickedEnter(true);
  }, []);

  const isMobileSurface = surface === "mobile";

  const renderedView = useMemo(() => {
    if (isMobileSurface) {
      return <MapViewMobile onReadyChange={handleReadyChange} />;
    }
    return <MapViewDisplay onReadyChange={handleReadyChange} />;
  }, [handleReadyChange, isMobileSurface]);

  // Mobile players go through a "Who are you?" prompt; DM surfaces skip that.
  const shouldShowLoadingScreen =
    !isMapReady || (isMobileSurface && !(hasSelectedCharacter && hasClickedEnter));
  const loadingScreenReady =
    isMapReady && (!isMobileSurface || (hasSelectedCharacter && hasClickedEnter));

  return (
    <>
      {shouldShowLoadingScreen && (
        <LoadingScreen
          isReady={loadingScreenReady}
          onEnterClick={handleEnterClick}
          showCharacterForm={isMobileSurface}
        />
      )}
      {renderedView}
    </>
  );
};

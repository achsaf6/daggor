"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useViewMode } from "../../hooks/useViewMode";
import { MapViewDisplay } from "./MapViewDisplay";
import { MapViewMobile } from "./MapViewMobile";
import { LoadingScreen } from "./LoadingScreen";
import { useCharacter } from "../../providers/CharacterProvider";

export const MapView = () => {
  const { isMobile, isDisplay } = useViewMode();
  const { hasSelectedCharacter } = useCharacter();
  const [isMapReady, setIsMapReady] = useState(false);
  const [hasClickedEnter, setHasClickedEnter] = useState(false);

  const handleReadyChange = useCallback((ready: boolean) => {
    setIsMapReady(ready);
  }, []);

  const handleEnterClick = useCallback(() => {
    setHasClickedEnter(true);
  }, []);

  const renderedView = useMemo(() => {
    if (isDisplay) {
      return <MapViewDisplay onReadyChange={handleReadyChange} />;
    }

    if (isMobile) {
      return <MapViewMobile onReadyChange={handleReadyChange} />;
    }

    // Default to display mode during SSR/hydration
    return <MapViewDisplay onReadyChange={handleReadyChange} />;
  }, [handleReadyChange, isDisplay, isMobile]);

  const shouldShowLoadingScreen = !isMapReady || (isMobile && !(hasSelectedCharacter && hasClickedEnter));
  const loadingScreenReady = isMapReady && (!isMobile || (hasSelectedCharacter && hasClickedEnter));

  return (
    <>
      {shouldShowLoadingScreen && <LoadingScreen isReady={loadingScreenReady} onEnterClick={handleEnterClick} />}
      {renderedView}
    </>
  );
};


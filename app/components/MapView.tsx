"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useViewMode } from "../hooks/useViewMode";
import { MapViewDisplay } from "./MapViewDisplay";
import { MapViewMobile } from "./MapViewMobile";
import { LoadingScreen } from "./LoadingScreen";

export const MapView = () => {
  const { isMobile, isDisplay } = useViewMode();
  const [isMapReady, setIsMapReady] = useState(false);

  const handleReadyChange = useCallback((ready: boolean) => {
    setIsMapReady(ready);
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

  return (
    <>
      <LoadingScreen isReady={isMapReady} />
      {renderedView}
    </>
  );
};


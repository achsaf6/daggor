"use client";

import React, { useRef, useCallback, useEffect, useMemo } from "react";
import { useSocket } from "../../hooks/useSocket";
import { useImageBounds } from "../../hooks/useImageBounds";
import { useViewMode } from "../../hooks/useViewMode";
import { useCoordinateMapper } from "../../hooks/useCoordinateMapper";
import { useSettings } from "../../hooks/useSettings";
import { MapImage } from "../MapImage";
import { DraggableToken } from "../DraggableToken";
import { TokenManager } from "../TokenManager";
import { CoverManager } from "../CoverManager";
import { GridLines } from "../GridLines";
import { usePanZoom } from "./hooks/usePanZoom";
import { useViewportOffset } from "./hooks/useViewportOffset";
import { useAutoCenter } from "./hooks/useAutoCenter";
import { useTransform } from "./hooks/useTransform";
import { useHammerGestures } from "./hooks/useHammerGestures";
import { TransformConfig } from "./types";
import { DEFAULT_GRID_DATA, GridData, fetchGridData } from "../../utils/gridData";

export const MapViewMobile = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isMounted } = useViewMode();
  const {
    myUserId,
    myColor,
    myPosition,
    otherUsers,
    disconnectedUsers,
    covers: socketCovers,
    updateTokenPosition,
    removeToken,
  } = useSocket(false);
  const { imageBounds, updateBounds } = useImageBounds(containerRef);
  const { settings, isLoading: settingsLoading } = useSettings();
  const [gridData, setGridData] = React.useState<GridData | null>(null);
  const [isGridLoading, setIsGridLoading] = React.useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let isActive = true;

    setIsGridLoading(true);

    const fetchGridlines = async () => {
      try {
        const data = await fetchGridData(controller.signal);
        if (!isActive) {
          return;
        }
        setGridData(data);
        setIsGridLoading(false);
      } catch (error) {
        if (!isActive) {
          return;
        }
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        console.error("Error fetching gridlines:", error);
        setGridData(DEFAULT_GRID_DATA);
        setIsGridLoading(false);
      }
    };

    fetchGridlines();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, []);

  const displaySettings = settings;
  const effectiveGridData = gridData ?? DEFAULT_GRID_DATA;

  // Extract world map dimensions from gridData for coordinate mapping
  const worldMapWidth = effectiveGridData.imageWidth || 0;
  const worldMapHeight = effectiveGridData.imageHeight || 0;

  const coordinateMapper = useCoordinateMapper(
    imageBounds,
    worldMapWidth,
    worldMapHeight
  );

  const covers = useMemo(() => Array.from(socketCovers.values()), [socketCovers]);

  // Pan and zoom state
  const {
    mobileZoomScale,
    setMobileZoomScale,
    zoomScaleRef,
    minZoom,
    maxZoom,
    panState,
    setPanState,
    panStateRef,
    panStartPosRef,
    isPinching,
    setIsPinching,
  } = usePanZoom();

  // Track which token is being dragged (if any)
  const [draggingTokenId, setDraggingTokenId] = React.useState<string | null>(null);
  const draggingTokenIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    draggingTokenIdRef.current = draggingTokenId;
  }, [draggingTokenId]);

  // Viewport offset for auto-centering
  const {
    viewportOffset,
    setViewportOffset,
    calculateViewportOffset,
    initializedRef,
  } = useViewportOffset({
    imageBounds,
    coordinateMapper,
    myUserId,
    myPosition,
    worldMapWidth,
    worldMapHeight,
    zoomScaleRef,
  });

  // Auto-center functionality
  const shouldAutoCenter = useCallback(() => !draggingTokenIdRef.current, []);

  const { resetInactivityTimer, inactivityTimerRef, lastInteractionRef } = useAutoCenter({
    calculateViewportOffset,
    setViewportOffset,
    setPanState,
    shouldAutoCenter,
  });

  // Handle token drag state changes
  const handleDragStateChange = useCallback((tokenId: string, isDragging: boolean) => {
    setDraggingTokenId(isDragging ? tokenId : null);
  }, []);

  // Initialize Hammer.js gestures
  useHammerGestures({
    containerRef,
    isMounted,
    panState,
    panStateRef,
    panStartPosRef,
    setPanState,
    mobileZoomScale,
    setMobileZoomScale,
    zoomScaleRef,
    minZoom,
    maxZoom,
    draggingTokenIdRef,
    setIsPinching,
    resetInactivityTimer,
  });

  // Handle screen rotation and orientation changes
  useEffect(() => {
    if (!isMounted) return;

    const handleOrientationChange = () => {
      if (draggingTokenIdRef.current) {
        return;
      }

      setTimeout(() => {
        updateBounds();
        const offset = calculateViewportOffset();
        setViewportOffset(offset);
        setPanState(prev => ({
          ...prev,
          translateX: offset.offsetX,
          translateY: offset.offsetY,
        }));
      }, 100);
    };

    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleOrientationChange);

    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', handleOrientationChange);
    };
  }, [isMounted, calculateViewportOffset, updateBounds, setViewportOffset, setPanState]);

  // Recalculate viewport offset when image bounds change
  useEffect(() => {
    if (draggingTokenId) {
      return;
    }

    if (isMounted && imageBounds && coordinateMapper.isReady) {
      const offset = calculateViewportOffset();
      setViewportOffset(offset);
      // Update pan position if not currently panning and already initialized
      if (!panStateRef.current.isPanning && initializedRef.current) {
        setPanState(current => ({
          ...current,
          translateX: offset.offsetX,
          translateY: offset.offsetY,
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted, draggingTokenId, imageBounds?.containerWidth, imageBounds?.containerHeight, imageBounds?.left, imageBounds?.top, coordinateMapper.isReady, calculateViewportOffset, setViewportOffset, setPanState, panStateRef, initializedRef]);

  // Initialize pan state when mobile mode is first enabled
  useEffect(() => {
    if (isMounted && !initializedRef.current && viewportOffset.offsetX !== 0) {
      setPanState({
        translateX: viewportOffset.offsetX,
        translateY: viewportOffset.offsetY,
        isPanning: false,
      });
      initializedRef.current = true;
    }
  }, [isMounted, viewportOffset.offsetX, viewportOffset.offsetY, setPanState, initializedRef]);

  // Initialize inactivity timer
  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;

    if (isMounted) {
      // Initialize lastInteractionRef after mount to avoid hydration mismatch
      lastInteractionRef.current = Date.now();
      resetInactivityTimer();
      timerId = inactivityTimerRef.current;
    }

    return () => {
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, [isMounted, resetInactivityTimer, lastInteractionRef, inactivityTimerRef]);

  // Calculate transform for rendering
  const { transform, mapWrapperStyle } = useTransform({
    isMounted,
    mobileZoomScale,
    panState,
    viewportOffset,
    isPinching,
  });

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 m-0 p-0 overflow-hidden"
      style={{ 
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        MozUserSelect: "none",
        msUserSelect: "none",
      }}
    >
      <div style={mapWrapperStyle}>
        <MapImage onLoad={updateBounds} />
        <CoverManager
          covers={covers}
          imageBounds={imageBounds}
          worldMapWidth={worldMapWidth}
          worldMapHeight={worldMapHeight}
        />
        {imageBounds && !isGridLoading && !settingsLoading && gridData && (
          <GridLines
            gridData={effectiveGridData}
            imageBounds={imageBounds}
            gridScale={displaySettings.gridScale}
            gridOffsetX={displaySettings.gridOffsetX}
            gridOffsetY={displaySettings.gridOffsetY}
          />
        )}
        {imageBounds && myUserId && (
          <div data-token>
            <DraggableToken
              tokenId={myUserId}
              position={myPosition}
              color={myColor}
              imageBounds={imageBounds}
              worldMapWidth={worldMapWidth}
              worldMapHeight={worldMapHeight}
              gridData={effectiveGridData}
              gridScale={displaySettings.gridScale}
              gridOffsetX={displaySettings.gridOffsetX}
              gridOffsetY={displaySettings.gridOffsetY}
              isMounted={isMounted}
              onPositionUpdate={updateTokenPosition}
              transform={transform as TransformConfig}
              onDragStateChange={handleDragStateChange}
              zIndex={20}
            />
          </div>
        )}
        <TokenManager
          activeUsers={otherUsers}
          disconnectedUsers={disconnectedUsers}
          imageBounds={imageBounds}
          worldMapWidth={worldMapWidth}
          worldMapHeight={worldMapHeight}
          gridData={effectiveGridData}
          gridScale={displaySettings.gridScale}
          gridOffsetX={displaySettings.gridOffsetX}
          gridOffsetY={displaySettings.gridOffsetY}
          isMounted={isMounted}
          isDisplay={false}
          myUserId={myUserId}
          onRemoveToken={removeToken}
          onPositionUpdate={updateTokenPosition}
          transform={transform as TransformConfig}
          onDragStateChange={handleDragStateChange}
        />
      </div>
    </div>
  );
};


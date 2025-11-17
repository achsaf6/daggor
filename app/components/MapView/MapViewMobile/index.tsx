"use client";

import React, { useRef, useCallback, useEffect, useMemo } from "react";
import { useSocket } from "../../../hooks/useSocket";
import { useImageBounds } from "../../../hooks/useImageBounds";
import { useViewMode } from "../../../hooks/useViewMode";
import { useCoordinateMapper } from "../../../hooks/useCoordinateMapper";
import { MapImage } from "../MapImage";
import { DraggableToken } from "../../Token/DraggableToken";
import { TokenManager } from "../../Token/TokenManager";
import { CoverManager } from "../../Toolbar/CoverManager";
import { GridLines } from "../GridLines";
import { usePanZoom } from "./hooks/usePanZoom";
import { useViewportOffset } from "./hooks/useViewportOffset";
import { useAutoCenter } from "./hooks/useAutoCenter";
import { useTransform } from "./hooks/useTransform";
import { useHammerGestures } from "./hooks/useHammerGestures";
import { TransformConfig } from "./types";
import { DEFAULT_GRID_DATA } from "../../../utils/gridData";
import { useBattlemap } from "../../../providers/BattlemapProvider";
import { useCharacter } from "../../../providers/CharacterProvider";

interface MapViewMobileProps {
  onReadyChange?: (isReady: boolean) => void;
}

export const MapViewMobile = ({ onReadyChange }: MapViewMobileProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isMounted } = useViewMode();
  const {
    myUserId,
    myColor,
    myPosition,
    myImageSrc,
    otherUsers,
    disconnectedUsers,
    updateTokenPosition,
    updateTokenImage,
    removeToken,
  } = useSocket(false);
  const { character, hasSelectedCharacter } = useCharacter();
  const { imageBounds, updateBounds } = useImageBounds(containerRef);
  const { currentBattlemap, isBattlemapLoading } = useBattlemap();

  const isReady =
    Boolean(imageBounds) && !isBattlemapLoading && Boolean(currentBattlemap);

  useEffect(() => {
    onReadyChange?.(isReady);
  }, [isReady, onReadyChange]);

  useEffect(() => {
    return () => {
      onReadyChange?.(false);
    };
  }, [onReadyChange]);

  useEffect(() => {
    if (!hasSelectedCharacter || !myUserId) {
      return;
    }
    if (!character) {
      return;
    }
    if (character.tokenImageUrl === myImageSrc) {
      return;
    }
    updateTokenImage(myUserId, character.tokenImageUrl ?? null);
  }, [
    hasSelectedCharacter,
    character,
    myUserId,
    myImageSrc,
    updateTokenImage,
  ]);

  const gridScale = currentBattlemap?.gridScale ?? 1;
  const gridOffsetX = currentBattlemap?.gridOffsetX ?? 0;
  const gridOffsetY = currentBattlemap?.gridOffsetY ?? 0;

  const effectiveGridData = currentBattlemap?.gridData ?? DEFAULT_GRID_DATA;

  // Extract world map dimensions from gridData for coordinate mapping
  const worldMapWidth = effectiveGridData.imageWidth || 0;
  const worldMapHeight = effectiveGridData.imageHeight || 0;

  const coordinateMapper = useCoordinateMapper(
    imageBounds,
    worldMapWidth,
    worldMapHeight
  );

  const covers = useMemo(() => currentBattlemap?.covers ?? [], [currentBattlemap?.covers]);

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
        <MapImage onLoad={updateBounds} src={currentBattlemap?.mapPath ?? undefined} />
        <CoverManager
          covers={covers}
          imageBounds={imageBounds}
          worldMapWidth={worldMapWidth}
          worldMapHeight={worldMapHeight}
        />
        {imageBounds && currentBattlemap && (
          <GridLines
            gridData={effectiveGridData}
            imageBounds={imageBounds}
            gridScale={gridScale}
            gridOffsetX={gridOffsetX}
            gridOffsetY={gridOffsetY}
          />
        )}
        {imageBounds && myUserId && (
          <div data-token>
            <DraggableToken
              tokenId={myUserId}
              position={myPosition}
              color={myColor}
              imageSrc={myImageSrc}
              imageBounds={imageBounds}
              worldMapWidth={worldMapWidth}
              worldMapHeight={worldMapHeight}
              gridData={effectiveGridData}
              gridScale={gridScale}
              gridOffsetX={gridOffsetX}
              gridOffsetY={gridOffsetY}
              isMounted={isMounted}
              onPositionUpdate={updateTokenPosition}
              onImageUpload={async (tokenId: string, file: File) => {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("tokenId", tokenId);
                
                const response = await fetch("/api/token-upload", {
                  method: "POST",
                  body: formData,
                });
                
                if (!response.ok) {
                  const error = await response.json();
                  throw new Error(error.error || "Failed to upload image");
                }
                
                const data = await response.json();
                updateTokenImage(tokenId, data.publicUrl);
                return data.publicUrl;
              }}
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
          gridScale={gridScale}
          gridOffsetX={gridOffsetX}
          gridOffsetY={gridOffsetY}
          isMounted={isMounted}
          isDisplay={false}
          myUserId={myUserId}
          onRemoveToken={removeToken}
          onPositionUpdate={updateTokenPosition}
          onImageUpload={async (tokenId: string, file: File) => {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("tokenId", tokenId);
            
            const response = await fetch("/api/token-upload", {
              method: "POST",
              body: formData,
            });
            
            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.error || "Failed to upload image");
            }
            
            const data = await response.json();
            updateTokenImage(tokenId, data.publicUrl);
            return data.publicUrl;
          }}
          transform={transform as TransformConfig}
          onDragStateChange={handleDragStateChange}
        />
      </div>
    </div>
  );
};


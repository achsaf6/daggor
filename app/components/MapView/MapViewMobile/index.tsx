"use client";

import React, { useRef, useCallback, useEffect, useMemo } from "react";
import { useSocket } from "../../../hooks/useSocket";
import { useSurface } from "../../../hooks/useSurface";
import { useImageBounds } from "../../../hooks/useImageBounds";
import { useViewMode } from "../../../hooks/useViewMode";
import { useInitiative } from "../../../hooks/useInitiative";
import { useSoundboardListener } from "../../../hooks/useSoundboardListener";
import { useCoordinateMapper } from "../../../hooks/useCoordinateMapper";
import { MapImage } from "../MapImage";
import { DraggableToken } from "../../Token/DraggableToken";
import { TokenManager } from "../../Token/TokenManager";
import { GridLines } from "../GridLines";
import { FogOfWar } from "../FogOfWar";
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
  const surface = useSurface();
  const {
    myUserId,
    myPersistentUserId,
    myColor,
    myPosition,
    myImageSrc,
    mySize,
    otherUsers,
    disconnectedUsers,
    updateTokenPosition,
    updateTokenImage,
    updateMyName,
    removeToken,
    socket,
  } = useSocket(surface);
  const { state: initiativeState } = useInitiative(socket);
  // Plays clips broadcast by the dashboard. Browsers gate autoplay; the
  // LoadingScreen "Enter" tap unlocks audio for this page.
  useSoundboardListener(socket);
  const currentTurnTokenId =
    initiativeState.currentIndex >= 0 &&
    initiativeState.currentIndex < initiativeState.entries.length
      ? initiativeState.entries[initiativeState.currentIndex].tokenId
      : null;
  // Initiative entries are keyed by persistentUserId now (stable across
  // reconnects), so compare against that — myUserId is the socket id which
  // changes on every reconnect.
  const isMyTurn = Boolean(myPersistentUserId && currentTurnTokenId === myPersistentUserId);
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

  // Push the chosen character's name to the server so the dashboard's
  // players panel renders "Lyra" instead of a hex stub. Initial identify in
  // useSocket also pulls from localStorage, but this fires when the player
  // changes character mid-session.
  useEffect(() => {
    if (!myUserId) return;
    updateMyName(character?.name ?? null);
  }, [character, myUserId, updateMyName]);

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

  const fogShapes = useMemo(
    () => currentBattlemap?.fogShapes ?? [],
    [currentBattlemap?.fogShapes]
  );

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
  });

  // Auto-center functionality — also pause if user is mid-pan,
  // so a manually panned view does not snap back after the inactivity timer.
  const shouldAutoCenter = useCallback(
    () => !draggingTokenIdRef.current && !panStateRef.current.isPanning,
    [panStateRef]
  );

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
    panStateRef,
    panStartPosRef,
    setPanState,
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
      {isMyTurn && (
        <div
          className="fixed top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-1.5 rounded-full border border-primary/60 bg-primary text-primary-foreground text-[11px] uppercase tracking-[0.25em] shadow-lg pointer-events-none animate-in fade-in slide-in-from-top-4"
          style={{
            animationDuration: "var(--dur-base)",
            animationTimingFunction: "var(--ease-emphasized)",
          }}
        >
          Your turn
        </div>
      )}
      <div style={mapWrapperStyle}>
        <MapImage onLoad={updateBounds} src={currentBattlemap?.mapPath ?? undefined} />
        {imageBounds && currentBattlemap && (
          <GridLines
            gridData={effectiveGridData}
            imageBounds={imageBounds}
            gridScale={gridScale}
            gridOffsetX={gridOffsetX}
            gridOffsetY={gridOffsetY}
          />
        )}
        {/* Players see fog fully opaque — only revealed shapes are visible. */}
        {imageBounds && (
          <FogOfWar shapes={fogShapes} imageBounds={imageBounds} opacity={1} />
        )}
        {imageBounds && myUserId && (
          <div data-token>
            <DraggableToken
              tokenId={myUserId}
              position={myPosition}
              color={myColor}
              imageSrc={myImageSrc}
              size={mySize}
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


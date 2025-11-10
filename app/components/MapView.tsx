"use client";

import React, { useRef, useMemo, useCallback, useEffect, useState } from "react";
import { useSocket } from "../hooks/useSocket";
import { useImageBounds } from "../hooks/useImageBounds";
import { useGridlines } from "../hooks/useGridlines";
import { useViewMode } from "../hooks/useViewMode";
import { useCoordinateMapper } from "../hooks/useCoordinateMapper";
import { usePan } from "../hooks/usePan";
import { useSettings } from "../hooks/useSettings";
import { MapImage } from "./MapImage";
import { DraggableToken } from "./DraggableToken";
import { TokenManager } from "./TokenManager";
import { GridLines } from "./GridLines";
import { MapSettings } from "./MapSettings";

export const MapView = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isMobile, isDisplay, isMounted } = useViewMode();
  const { myUserId, myColor, myPosition, otherUsers, disconnectedUsers, updateTokenPosition, removeToken } = useSocket(isDisplay);
  const { imageBounds, updateBounds } = useImageBounds(containerRef);
  const { gridData } = useGridlines();
  const { settings, setGridScale, setGridOffset } = useSettings();

  // Extract world map dimensions from gridData for coordinate mapping
  const worldMapWidth = gridData.imageWidth || 0;
  const worldMapHeight = gridData.imageHeight || 0;

  const coordinateMapper = useCoordinateMapper(
    imageBounds,
    worldMapWidth,
    worldMapHeight
  );

  // Helper function to calculate center transform
  // This calculates the translate needed to center the user's token
  // CSS transforms apply right-to-left: scale(zoomScale) translate(x, y) means translate first, then scale
  // With transformOrigin: center center, the scale happens around the center point
  // After translate(t) then scale(s) around center C:
  //   A point at P becomes: C + (P + t - C) * s = C + (P - C) * s + t * s
  // To center userPos at viewport center:
  //   center = center + (userPos - center) * s + translate * s
  //   translate * s = -(userPos - center) * s
  //   translate = -(userPos - center) = (center - userPos)
  // So we need translate = (center - userPos) WITHOUT multiplying by scale
  const calculateCenterTransform = useCallback(() => {
    if (!isMobile || !imageBounds || !coordinateMapper.isReady || worldMapWidth === 0 || worldMapHeight === 0) {
      return { translateX: 0, translateY: 0 };
    }

    // Convert user's image-relative position to screen coordinates (unscaled space)
    const userImageRelative = { x: myPosition.x, y: myPosition.y };
    const userScreenPos = coordinateMapper.imageRelativeToScreen(userImageRelative);
    
    if (!userScreenPos) {
      return { translateX: 0, translateY: 0 };
    }

    // Calculate center of viewport (container center)
    const viewportCenterX = imageBounds.containerLeft + imageBounds.containerWidth / 2;
    const viewportCenterY = imageBounds.containerTop + imageBounds.containerHeight / 2;

    // Calculate translate needed to center the user
    // Since translate happens first, then scale, and scale multiplies the translate,
    // we need: translate = (center - userPos) (not multiplied by scale)
    const deltaX = viewportCenterX - userScreenPos.x;
    const deltaY = viewportCenterY - userScreenPos.y;
    
    const translateX = deltaX;
    const translateY = deltaY;

    return { translateX, translateY };
  }, [isMobile, imageBounds, coordinateMapper, worldMapWidth, worldMapHeight, myPosition]);

  // Calculate initial center position for auto-centering
  const initialCenterTransform = useMemo(() => {
    return calculateCenterTransform();
  }, [calculateCenterTransform]);

  // Pan hook for mobile mode - use ref to avoid circular dependency
  const panRef = useRef<{ setPanPosition: (x: number, y: number, animated: boolean) => void } | null>(null);
  const initializedRef = useRef(false);

  // Mobile zoom factor
  const zoomScale = isMobile ? 2.5 : 1;

  // Auto-center callback for pan hook
  const handleAutoCenter = useCallback(() => {
    if (!isMobile || !imageBounds || !coordinateMapper.isReady) return;
    
    const centerTransform = calculateCenterTransform();
    if (panRef.current) {
      panRef.current.setPanPosition(centerTransform.translateX, centerTransform.translateY, true);
    }
  }, [isMobile, imageBounds, coordinateMapper, calculateCenterTransform]);

  // Pan hook for mobile mode
  const pan = usePan({
    enabled: isMobile,
    onAutoCenter: handleAutoCenter,
    inactivityTimeout: 5000,
    scale: zoomScale, // Pass scale so pan accounts for zoom
  });

  // Store pan functions in ref (use effect to avoid render-time ref update)
  useEffect(() => {
    panRef.current = {
      setPanPosition: pan.setPanPosition,
    };
  }, [pan.setPanPosition]);

  // Initialize pan state with center position when mobile mode is first enabled
  useEffect(() => {
    if (isMobile && !initializedRef.current && initialCenterTransform.translateX !== 0) {
      pan.setPanPosition(initialCenterTransform.translateX, initialCenterTransform.translateY, false);
      initializedRef.current = true;
    } else if (!isMobile) {
      initializedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, initialCenterTransform.translateX, initialCenterTransform.translateY]);

  // Calculate mobile mode transforms (zoom + pan)
  // Only apply mobile transforms after mount to prevent hydration mismatch
  const mobileTransform = useMemo(() => {
    if (!isMobile || !isMounted) {
      return { scale: 1, translateX: 0, translateY: 0 };
    }

    // Use pan state if panning, otherwise use initial center transform
    const translateX = pan.panState.isPanning || pan.panState.translateX !== 0 
      ? pan.panState.translateX 
      : initialCenterTransform.translateX;
    const translateY = pan.panState.isPanning || pan.panState.translateY !== 0 
      ? pan.panState.translateY 
      : initialCenterTransform.translateY;

    return {
      scale: zoomScale,
      translateX,
      translateY,
    };
  }, [isMobile, isMounted, zoomScale, pan.panState, initialCenterTransform]);

  // Track which token is being dragged (if any)
  const [draggingTokenId, setDraggingTokenId] = useState<string | null>(null);

  // Handle panning on container (not tokens)
  const handleContainerMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isMobile) return;
    // Only start pan if not clicking on any token
    const target = e.target as HTMLElement;
    if (target.closest('[data-token]')) {
      return; // Let token handle it
    }
    e.stopPropagation(); // Prevent token handlers from firing
    pan.startPan(e.clientX, e.clientY);
    pan.trackInteraction();
  }, [isMobile, pan]);

  const handleContainerTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isMobile) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-token]')) {
      return;
    }
    e.stopPropagation(); // Prevent token handlers from firing
    const touch = e.touches[0];
    if (touch) {
      pan.startPan(touch.clientX, touch.clientY);
      pan.trackInteraction();
    }
  }, [isMobile, pan]);

  const handleContainerMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isMobile) return;
    // Only pan if we're actively panning and not dragging token
    if (pan.panState.isPanning && !draggingTokenId) {
      pan.updatePan(e.clientX, e.clientY);
      pan.trackInteraction();
    }
  }, [isMobile, pan, draggingTokenId]);

  const handleContainerTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isMobile) return;
    // Only pan if we're actively panning and not dragging token
    if (pan.panState.isPanning && !draggingTokenId) {
      const touch = e.touches[0];
      if (touch) {
        pan.updatePan(touch.clientX, touch.clientY);
        pan.trackInteraction();
      }
    }
  }, [isMobile, pan, draggingTokenId]);

  const handleContainerMouseUp = useCallback(() => {
    if (!isMobile) return;
    pan.endPan();
  }, [isMobile, pan]);

  const handleContainerTouchEnd = useCallback(() => {
    if (!isMobile) return;
    pan.endPan();
  }, [isMobile, pan]);

  // Track interactions for inactivity timer
  const handleInteraction = useCallback(() => {
    if (isMobile) {
      pan.trackInteraction();
    }
  }, [isMobile, pan]);

  // Apply transform to a wrapper div for mobile mode
  // Only apply styles after mount to prevent hydration mismatch
  const mapWrapperStyle = isMobile && isMounted && mobileTransform.scale !== 1
    ? {
        transform: `scale(${mobileTransform.scale}) translate(${mobileTransform.translateX}px, ${mobileTransform.translateY}px)`,
        transformOrigin: 'center center',
        width: '100%',
        height: '100%',
        transition: pan.panState.isPanning ? 'none' : 'transform 0.5s ease-out',
      }
    : {};

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 m-0 p-0 overflow-hidden"
      onMouseDown={isMobile ? handleContainerMouseDown : undefined}
      onMouseMove={(e) => {
        // In mobile mode, only handle panning if not dragging a token
        if (isMobile && pan.panState.isPanning && !draggingTokenId) {
          handleContainerMouseMove(e);
        }
      }}
      onMouseUp={() => {
        if (isMobile) {
          handleContainerMouseUp();
        }
      }}
      onMouseLeave={() => {
        if (isMobile) {
          handleContainerMouseUp();
        }
      }}
      onTouchStart={isMobile ? handleContainerTouchStart : undefined}
      onTouchMove={(e) => {
        if (isMobile && pan.panState.isPanning && !draggingTokenId) {
          handleContainerTouchMove(e);
        }
      }}
      onTouchEnd={() => {
        if (isMobile) {
          handleContainerTouchEnd();
        }
      }}
      onClick={(e) => {
        // Prevent clicks on background
        if (
          e.target === e.currentTarget ||
          (e.target as HTMLElement).tagName === "IMG"
        ) {
          e.preventDefault();
          e.stopPropagation();
        }
        handleInteraction();
      }}
      onMouseMoveCapture={handleInteraction}
      onTouchMoveCapture={handleInteraction}
      style={{ touchAction: "none" }}
    >
      {isDisplay && (
        <MapSettings
          gridScale={settings.gridScale}
          onGridScaleChange={setGridScale}
          gridOffsetX={settings.gridOffsetX}
          gridOffsetY={settings.gridOffsetY}
          onGridOffsetChange={setGridOffset}
        />
      )}
      <div style={mapWrapperStyle}>
        <MapImage onLoad={updateBounds} />
        {imageBounds && (
          <GridLines
            gridData={gridData}
            imageBounds={imageBounds}
            gridScale={settings.gridScale}
            gridOffsetX={settings.gridOffsetX}
            gridOffsetY={settings.gridOffsetY}
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
              gridData={gridData}
              gridScale={settings.gridScale}
              gridOffsetX={settings.gridOffsetX}
              gridOffsetY={settings.gridOffsetY}
              isMounted={isMounted}
              onPositionUpdate={updateTokenPosition}
              transform={mobileTransform}
              onDragStateChange={setDraggingTokenId}
            />
          </div>
        )}
        <TokenManager
          activeUsers={otherUsers}
          disconnectedUsers={disconnectedUsers}
          imageBounds={imageBounds}
          worldMapWidth={worldMapWidth}
          worldMapHeight={worldMapHeight}
          gridData={gridData}
          gridScale={settings.gridScale}
          gridOffsetX={settings.gridOffsetX}
          gridOffsetY={settings.gridOffsetY}
          isMounted={isMounted}
          isDisplay={isDisplay}
          myUserId={myUserId}
          onRemoveToken={removeToken}
          onPositionUpdate={updateTokenPosition}
          transform={mobileTransform}
          onDragStateChange={setDraggingTokenId}
        />
      </div>
    </div>
  );
};


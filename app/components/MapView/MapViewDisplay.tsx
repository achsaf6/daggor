"use client";

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useSocket } from "../../hooks/useSocket";
import { useSurface } from "../../hooks/useSurface";
import { useImageBounds } from "../../hooks/useImageBounds";
import { useCoordinateMapper } from "../../hooks/useCoordinateMapper";
import { useIdleDim } from "../../hooks/useIdleDim";
import { MapImage } from "./MapImage";
import { TokenManager } from "../Token/TokenManager";
import { GridLines } from "./GridLines";
import { FogOfWar } from "./FogOfWar";
import { FogManager } from "./FogManager";
import { SidebarToolbar } from "../Toolbar/SidebarToolbar";
import { PlayerStatusPanel } from "../Dashboard/PlayerStatusPanel";
import { InitiativePanel } from "../Dashboard/InitiativePanel";
import { SoundboardPanel } from "../Dashboard/SoundboardPanel";
import { useSoundboardListener } from "../../hooks/useSoundboardListener";
import { Position, TokenTemplate } from "../../types";
import { snapToGridCenter } from "../../utils/coordinates";
import { DEFAULT_GRID_DATA } from "../../utils/gridData";
import { useBattlemap, type SpawnArea } from "../../providers/BattlemapProvider";
import { getTokenSizeUnits } from "../../utils/tokenSizes";

interface MapViewDisplayProps {
  onReadyChange?: (isReady: boolean) => void;
}

export const MapViewDisplay = ({ onReadyChange }: MapViewDisplayProps) => {
  const surface = useSurface();
  const showToolbar = surface === "dashboard";
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    myUserId,
    otherUsers,
    disconnectedUsers,
    updateTokenPosition,
    updateTokenImage,
    updateTokenSize,
    removeToken,
    addToken,
    socket,
  } = useSocket(surface);
  // Both dashboard and display surfaces play the broadcast clips so the GM
  // hears them too, regardless of which window has focus.
  useSoundboardListener(socket);
  const { imageBounds, updateBounds } = useImageBounds(containerRef);
  const {
    currentBattlemap,
    isBattlemapLoading,
    updateBattlemapSettings,
    setActiveBattlemapImage,
    updateSpawnArea,
    addFogArea,
    removeFogArea,
    updateFogArea,
    clearFog,
    canManageBattlemaps,
  } = useBattlemap();

  const isReady =
    Boolean(imageBounds) && !isBattlemapLoading && Boolean(currentBattlemap);

  // Glass Atelier auto-dim: after 4s of no input, all .glass-panel children
  // fade to ~40% opacity (CSS rule in globals.css keys off data-idle="true").
  // Only enabled on the dashboard — display surface has no panels to dim.
  const isIdle = useIdleDim(4000);

  useEffect(() => {
    onReadyChange?.(isReady);
  }, [isReady, onReadyChange]);

  useEffect(() => {
    return () => {
      onReadyChange?.(false);
    };
  }, [onReadyChange]);

  const gridScale = currentBattlemap?.gridScale ?? 1;
  const gridOffsetX = currentBattlemap?.gridOffsetX ?? 0;
  const gridOffsetY = currentBattlemap?.gridOffsetY ?? 0;

  const effectiveGridData = currentBattlemap?.gridData ?? DEFAULT_GRID_DATA;

  const images = useMemo(() => currentBattlemap?.images ?? [], [currentBattlemap?.images]);
  const activeImageId = currentBattlemap?.activeImageId ?? null;

  const handleGridScaleChange = useCallback(
    (value: number) => {
      updateBattlemapSettings({
        gridScale: value,
      });
    },
    [updateBattlemapSettings]
  );

  const handleGridOffsetChange = useCallback(
    (x: number, y: number) => {
      updateBattlemapSettings({
        gridOffsetX: x,
        gridOffsetY: y,
      });
    },
    [updateBattlemapSettings]
  );

  // Extract world map dimensions from gridData for coordinate mapping
  const worldMapWidth = effectiveGridData.imageWidth || 0;
  const worldMapHeight = effectiveGridData.imageHeight || 0;

  const coordinateMapper = useCoordinateMapper(imageBounds, worldMapWidth, worldMapHeight);

  // No transform for display mode
  const transform = { scale: 1, translateX: 0, translateY: 0 };

  // Drag state for token creation
  const [draggingToken, setDraggingToken] = useState<TokenTemplate | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);

  // Drawing tools — shared rectangle-drawing primitives used by spawn-area
  // and fog tools. Cover tool was removed; fog took over its role.
  const [isSpawnToolActive, setIsSpawnToolActive] = useState(false);
  const [isFogToolActive, setIsFogToolActive] = useState(false);
  const [isDrawingSquare, setIsDrawingSquare] = useState(false);
  const [squareStartPos, setSquareStartPos] = useState<{ x: number; y: number } | null>(null);
  const [squareCurrentPos, setSquareCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const spawnArea = currentBattlemap?.spawnArea ?? null;
  const fogShapes = useMemo(
    () => currentBattlemap?.fogShapes ?? [],
    [currentBattlemap?.fogShapes]
  );

  const resetSquareDrawing = useCallback(() => {
    setIsDrawingSquare(false);
    setSquareStartPos(null);
    setSquareCurrentPos(null);
  }, []);

  // Track mouse position during drag
  useEffect(() => {
    if (!draggingToken) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      setDragPosition({ x: e.clientX, y: e.clientY });
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      setDragPosition(null);
    };
  }, [draggingToken]);

  const handleTokenDragStart = (tokenTemplate: TokenTemplate) => {
    setDraggingToken(tokenTemplate);
  };

  const handleTokenDragEnd = () => {
    setDraggingToken(null);
    setDragPosition(null);
  };

  const handleSpawnToolToggle = () => {
    setIsSpawnToolActive((prev) => {
      const next = !prev;
      if (next) {
        setIsFogToolActive(false);
        resetSquareDrawing();
      } else {
        resetSquareDrawing();
      }
      return next;
    });
  };

  const handleFogToolToggle = () => {
    setIsFogToolActive((prev) => {
      const next = !prev;
      if (next) {
        setIsSpawnToolActive(false);
        resetSquareDrawing();
      } else {
        resetSquareDrawing();
      }
      return next;
    });
  };

  // Handle mouse events for drawing squares
  useEffect(() => {
    if (!isDrawingSquare || !squareStartPos || !coordinateMapper.isReady) {
      return;
    }

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const imageRelative = coordinateMapper.screenToImageRelative({
        x: e.clientX,
        y: e.clientY,
      });

      if (imageRelative) {
        setSquareCurrentPos({ x: imageRelative.x, y: imageRelative.y });
      }
    };

    const handleGlobalMouseUp = () => {
      if (!squareStartPos || !squareCurrentPos || !coordinateMapper.isReady) {
        resetSquareDrawing();
        return;
      }

      // Calculate square dimensions
      const minX = Math.min(squareStartPos.x, squareCurrentPos.x);
      const maxX = Math.max(squareStartPos.x, squareCurrentPos.x);
      const minY = Math.min(squareStartPos.y, squareCurrentPos.y);
      const maxY = Math.max(squareStartPos.y, squareCurrentPos.y);

      const width = maxX - minX;
      const height = maxY - minY;

      // Only commit if the rectangle has meaningful size (at least 0.5% per axis).
      if (width > 0.5 && height > 0.5) {
        if (isSpawnToolActive) {
          const spawn: SpawnArea = { x: minX, y: minY, width, height };
          void updateSpawnArea(spawn);
          setIsSpawnToolActive(false);
        } else if (isFogToolActive) {
          // Each draw adds a fog rectangle; the fog tool stays active so the
          // GM can lay down multiple fog areas in succession.
          void addFogArea({ x: minX, y: minY, width, height });
        }
      }

      resetSquareDrawing();
    };

    document.addEventListener("mousemove", handleGlobalMouseMove);
    document.addEventListener("mouseup", handleGlobalMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleGlobalMouseMove);
      document.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [
    isDrawingSquare,
    squareStartPos,
    squareCurrentPos,
    coordinateMapper,
    isSpawnToolActive,
    isFogToolActive,
    updateSpawnArea,
    addFogArea,
    resetSquareDrawing,
  ]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((!isSpawnToolActive && !isFogToolActive) || !imageBounds || !coordinateMapper.isReady || draggingToken) {
      return;
    }

    // Fog tool: clicking *on* an existing fog rectangle erases that one.
    // Drag-to-add still works on empty area. We do hit-testing in
    // image-relative space, not pixel space, so it survives pan/zoom.
    if (isFogToolActive && fogShapes.length > 0) {
      const point = coordinateMapper.screenToImageRelative({
        x: e.clientX,
        y: e.clientY,
      });
      if (point) {
        // Iterate in reverse so the most recently drawn fog (rendered on top)
        // is erased first when shapes overlap.
        for (let i = fogShapes.length - 1; i >= 0; i -= 1) {
          const s = fogShapes[i];
          if (
            point.x >= s.x &&
            point.x <= s.x + s.width &&
            point.y >= s.y &&
            point.y <= s.y + s.height
          ) {
            e.preventDefault();
            void removeFogArea(s.id);
            return;
          }
        }
      }
    }

    // Don't start drawing if clicking on an interactive fog handle (move/resize).
    const target = e.target as HTMLElement;
    if (target.closest('[data-fog-handle]')) {
      return;
    }

    e.preventDefault();
    const imageRelative = coordinateMapper.screenToImageRelative({
      x: e.clientX,
      y: e.clientY,
    });

    if (imageRelative) {
      setIsDrawingSquare(true);
      setSquareStartPos({ x: imageRelative.x, y: imageRelative.y });
      setSquareCurrentPos({ x: imageRelative.x, y: imageRelative.y });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    
    if (!draggingToken || !imageBounds || !coordinateMapper.isReady) {
      return;
    }

    const dropX = e.clientX;
    const dropY = e.clientY;

    const imageRelative = coordinateMapper.screenToImageRelative({
      x: dropX,
      y: dropY,
    });

    if (imageRelative) {
      let position: Position = {
        x: imageRelative.x,
        y: imageRelative.y,
      };

      if (effectiveGridData.imageWidth > 0 && effectiveGridData.imageHeight > 0) {
        position = snapToGridCenter(
          position,
          effectiveGridData,
          gridScale,
          gridOffsetX,
          gridOffsetY,
          draggingToken.size,
          imageBounds
        );
      }

      addToken(draggingToken, position);
    }

    handleTokenDragEnd();
  };

  return (
    <div
      ref={containerRef}
      // Projector surface gets a subtle vignette darkening the edges so the
      // table reads as "lit by the map". Dashboard keeps the full canvas for
      // clarity. The pseudo-element sits above the map (z 7) but below tokens
      // (z 10/20) and the toolbar (z 50). When the dashboard is idle for >4s,
      // `data-idle="true"` cascades into the glass panels and fades them.
      className={`fixed inset-0 m-0 p-0 overflow-hidden ${
        showToolbar ? "" : "glass-vignette"
      }`}
      data-idle={showToolbar && isIdle ? "true" : "false"}
      style={{
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        MozUserSelect: "none",
        msUserSelect: "none",
      }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onMouseDown={handleMouseDown}
      data-testid="map-canvas"
    >
      {showToolbar && (
        <PlayerStatusPanel
          activeUsers={otherUsers}
          disconnectedUsers={disconnectedUsers}
        />
      )}
      {showToolbar && (
        <InitiativePanel socket={socket} activeUsers={otherUsers} />
      )}
      {showToolbar && <SoundboardPanel socket={socket} />}
      {showToolbar && (
        <SidebarToolbar
          gridScale={gridScale}
          onGridScaleChange={handleGridScaleChange}
          gridOffsetX={gridOffsetX}
          gridOffsetY={gridOffsetY}
          onGridOffsetChange={handleGridOffsetChange}
          onTokenDragStart={handleTokenDragStart}
          onTokenDragEnd={handleTokenDragEnd}
          onSpawnToolToggle={handleSpawnToolToggle}
          isSpawnToolActive={isSpawnToolActive}
          onFogToolToggle={handleFogToolToggle}
          isFogToolActive={isFogToolActive}
          onFogClear={() => void clearFog()}
          fogReady={fogShapes.length > 0}
          gridData={effectiveGridData}
          floors={images}
          activeFloorId={activeImageId}
          onSelectFloor={(floorId) => void setActiveBattlemapImage(floorId)}
          floorControlsDisabled={!canManageBattlemaps || isBattlemapLoading}
        />
      )}
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
      {/* Players (display + mobile) see fully opaque fog with feathered
          edges. The dashboard renders the same fog at lower opacity AND
          adds interactive move/resize handles via FogManager so the GM
          can adjust shapes after placing them. */}
      {imageBounds && (
        <FogOfWar
          shapes={fogShapes}
          imageBounds={imageBounds}
          opacity={showToolbar ? 0.45 : 1}
        />
      )}
      {showToolbar && imageBounds && (
        <FogManager
          shapes={fogShapes}
          imageBounds={imageBounds}
          worldMapWidth={worldMapWidth}
          worldMapHeight={worldMapHeight}
          isToolActive={isFogToolActive}
          onMove={(id, x, y) => void updateFogArea(id, { x, y })}
          onResize={(id, x, y, width, height) =>
            void updateFogArea(id, { x, y, width, height })
          }
          onRemove={(id) => void removeFogArea(id)}
        />
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
        isMounted={true}
        // Only the dashboard surface shows DM affordances (right-click remove,
        // size-edit menu). The /display projector view stays read-only.
        isDisplay={showToolbar}
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
        transform={transform}
        onDragStateChange={() => {}}
        onSizeChange={updateTokenSize}
      />
      {/* Preview token while dragging */}
      {draggingToken && dragPosition && imageBounds && (
        <div
          className="fixed rounded-full border-2 border-white border-dashed shadow-lg z-30 pointer-events-none opacity-60"
          style={{
            left: `${dragPosition.x}px`,
            top: `${dragPosition.y}px`,
            width: `${40 * getTokenSizeUnits(draggingToken.size)}px`,
            height: `${40 * getTokenSizeUnits(draggingToken.size)}px`,
            transform: "translate(-50%, -50%)",
            backgroundColor: draggingToken.imageUrl ? undefined : draggingToken.color,
            backgroundImage: draggingToken.imageUrl ? `url(${draggingToken.imageUrl})` : undefined,
            backgroundSize: draggingToken.imageUrl ? "cover" : undefined,
            backgroundPosition: draggingToken.imageUrl ? "center" : undefined,
          }}
        />
      )}
      {/* Spawn area overlay (dashboard only). Players don't see this; it's an
          editor affordance so the GM knows where new tokens will land. */}
      {showToolbar && spawnArea && imageBounds && coordinateMapper.isReady && (() => {
        const tl = coordinateMapper.imageRelativeToScreen({ x: spawnArea.x, y: spawnArea.y });
        const br = coordinateMapper.imageRelativeToScreen({
          x: spawnArea.x + spawnArea.width,
          y: spawnArea.y + spawnArea.height,
        });
        if (!tl || !br) return null;
        return (
          <div
            className="fixed border-2 border-emerald-400/70 border-dashed pointer-events-none z-[6]"
            style={{
              left: `${tl.x}px`,
              top: `${tl.y}px`,
              width: `${br.x - tl.x}px`,
              height: `${br.y - tl.y}px`,
              backgroundColor: "rgba(52, 211, 153, 0.12)",
            }}
            title="Spawn area — players land here"
          />
        );
      })()}
      {/* Preview square while drawing (covers in blue, spawn area in green) */}
      {isDrawingSquare && squareStartPos && squareCurrentPos && imageBounds && coordinateMapper.isReady && (
        (() => {
          const startScreen = coordinateMapper.imageRelativeToScreen(squareStartPos);
          const currentScreen = coordinateMapper.imageRelativeToScreen(squareCurrentPos);
          if (!startScreen || !currentScreen) return null;

          const left = Math.min(startScreen.x, currentScreen.x);
          const top = Math.min(startScreen.y, currentScreen.y);
          const width = Math.abs(currentScreen.x - startScreen.x);
          const height = Math.abs(currentScreen.y - startScreen.y);
          const previewColor = isSpawnToolActive
            ? { border: "border-emerald-300", bg: "rgba(52, 211, 153, 0.25)" }
            : isFogToolActive
            ? { border: "border-purple-300", bg: "rgba(168, 85, 247, 0.25)" }
            : { border: "border-blue-400", bg: "rgba(59, 130, 246, 0.2)" };

          return (
            <div
              className={`fixed border-2 border-dashed shadow-lg z-30 pointer-events-none opacity-80 ${previewColor.border}`}
              style={{
                left: `${left}px`,
                top: `${top}px`,
                width: `${width}px`,
                height: `${height}px`,
                backgroundColor: previewColor.bg,
              }}
            />
          );
        })()
      )}
    </div>
  );
};

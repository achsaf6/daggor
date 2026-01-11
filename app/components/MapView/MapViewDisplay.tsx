"use client";

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useSocket } from "../../hooks/useSocket";
import { useImageBounds } from "../../hooks/useImageBounds";
import { useCoordinateMapper } from "../../hooks/useCoordinateMapper";
import { MapImage } from "./MapImage";
import { TokenManager } from "../Token/TokenManager";
import { GridLines } from "./GridLines";
import { SidebarToolbar } from "../Toolbar/SidebarToolbar";
import { CoverManager } from "../Toolbar/CoverManager";
import { Position, TokenTemplate } from "../../types";
import { snapToGridCenter } from "../../utils/coordinates";
import { DEFAULT_GRID_DATA } from "../../utils/gridData";
import { useBattlemap } from "../../providers/BattlemapProvider";
import { getTokenSizeUnits } from "../../utils/tokenSizes";

interface MapViewDisplayProps {
  onReadyChange?: (isReady: boolean) => void;
}

export const MapViewDisplay = ({ onReadyChange }: MapViewDisplayProps) => {
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
  } = useSocket(true);
  const { imageBounds, updateBounds } = useImageBounds(containerRef);
  const {
    currentBattlemap,
    isBattlemapLoading,
    updateBattlemapSettings,
    addCover,
    updateCover,
    removeCover,
    setActiveBattlemapImage,
    canManageBattlemaps,
  } = useBattlemap();

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

  const gridScale = currentBattlemap?.gridScale ?? 1;
  const gridOffsetX = currentBattlemap?.gridOffsetX ?? 0;
  const gridOffsetY = currentBattlemap?.gridOffsetY ?? 0;

  const effectiveGridData = currentBattlemap?.gridData ?? DEFAULT_GRID_DATA;

  const images = useMemo(() => currentBattlemap?.images ?? [], [currentBattlemap?.images]);
  const activeImageId = currentBattlemap?.activeImageId ?? null;
  const activeImageIndex = useMemo(() => {
    if (!activeImageId) {
      return images.length > 0 ? 0 : -1;
    }
    return images.findIndex((img) => img.id === activeImageId);
  }, [activeImageId, images]);

  const handlePrevFloor = useCallback(() => {
    if (!canManageBattlemaps || images.length < 2) return;
    const currentIndex = activeImageIndex >= 0 ? activeImageIndex : 0;
    if (currentIndex > 0) {
      void setActiveBattlemapImage(images[currentIndex - 1].id);
    }
  }, [activeImageIndex, canManageBattlemaps, images, setActiveBattlemapImage]);

  const handleNextFloor = useCallback(() => {
    if (!canManageBattlemaps || images.length < 2) return;
    const currentIndex = activeImageIndex >= 0 ? activeImageIndex : 0;
    if (currentIndex < images.length - 1) {
      void setActiveBattlemapImage(images[currentIndex + 1].id);
    }
  }, [activeImageIndex, canManageBattlemaps, images, setActiveBattlemapImage]);

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

  const handleCoverPositionUpdate = useCallback(
    (id: string, x: number, y: number) => {
      updateCover(id, { x, y });
    },
    [updateCover]
  );

  const handleCoverSizeUpdate = useCallback(
    (id: string, width: number, height: number, x: number, y: number) => {
      updateCover(id, { width, height, x, y });
    },
    [updateCover]
  );

  const handleCoverRemove = useCallback(
    (id: string) => {
      removeCover(id);
    },
    [removeCover]
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

  // Cover management
  const covers = useMemo(() => currentBattlemap?.covers ?? [], [currentBattlemap?.covers]);
  const [isSquareToolActive, setIsSquareToolActive] = useState(false);
  const [isSquareToolLocked, setIsSquareToolLocked] = useState(false);
  const [isDrawingSquare, setIsDrawingSquare] = useState(false);
  const [squareStartPos, setSquareStartPos] = useState<{ x: number; y: number } | null>(null);
  const [squareCurrentPos, setSquareCurrentPos] = useState<{ x: number; y: number } | null>(null);

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

  const handleSquareToolToggle = () => {
    if (isSquareToolLocked) {
      setIsSquareToolLocked(false);
      setIsSquareToolActive(false);
      resetSquareDrawing();
      return;
    }

    setIsSquareToolActive((prev) => {
      const next = !prev;
      if (!next) {
        resetSquareDrawing();
      }
      return next;
    });
  };

  const handleSquareToolLockToggle = () => {
    setIsSquareToolLocked((prev) => {
      const next = !prev;
      if (next) {
        setIsSquareToolActive(true);
      } else {
        setIsSquareToolActive(false);
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

      // Only create cover if it has meaningful size (at least 0.5% in each dimension)
      if (width > 0.5 && height > 0.5) {
        addCover({
          x: minX,
          y: minY,
          width,
          height,
        });

        if (!isSquareToolLocked) {
          setIsSquareToolActive(false);
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
    addCover,
    isSquareToolLocked,
    resetSquareDrawing,
  ]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isSquareToolActive || !imageBounds || !coordinateMapper.isReady || draggingToken) {
      return;
    }

    // Don't start drawing if clicking on a cover (covers handle their own events)
    const target = e.target as HTMLElement;
    if (target.closest('[data-cover]')) {
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
          draggingToken.size
        );
      }

      addToken(draggingToken, position);
    }

    handleTokenDragEnd();
  };

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
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onMouseDown={handleMouseDown}
    >
      <SidebarToolbar
        gridScale={gridScale}
        onGridScaleChange={handleGridScaleChange}
        gridOffsetX={gridOffsetX}
        gridOffsetY={gridOffsetY}
        onGridOffsetChange={handleGridOffsetChange}
        onTokenDragStart={handleTokenDragStart}
        onTokenDragEnd={handleTokenDragEnd}
        onSquareToolToggle={handleSquareToolToggle}
        onSquareToolLockToggle={handleSquareToolLockToggle}
        isSquareToolActive={isSquareToolActive}
        isSquareToolLocked={isSquareToolLocked}
        gridData={effectiveGridData}
        floorCount={images.length}
        floorIndex={activeImageIndex >= 0 ? activeImageIndex : 0}
        floorLabel={
          images.length > 0
            ? images[activeImageIndex >= 0 ? activeImageIndex : 0]?.name ?? "Floor"
            : null
        }
        onPrevFloor={handlePrevFloor}
        onNextFloor={handleNextFloor}
        floorControlsDisabled={!canManageBattlemaps || isBattlemapLoading}
      />
      <MapImage onLoad={updateBounds} src={currentBattlemap?.mapPath ?? undefined} />
      <CoverManager
        covers={covers}
        imageBounds={imageBounds}
        worldMapWidth={worldMapWidth}
        worldMapHeight={worldMapHeight}
        isDraggable
        onRemoveCover={handleCoverRemove}
        onPositionUpdate={handleCoverPositionUpdate}
        onSizeUpdate={handleCoverSizeUpdate}
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
        isDisplay={true}
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
      {/* Preview square while drawing */}
      {isDrawingSquare && squareStartPos && squareCurrentPos && imageBounds && coordinateMapper.isReady && (
        (() => {
          const startScreen = coordinateMapper.imageRelativeToScreen(squareStartPos);
          const currentScreen = coordinateMapper.imageRelativeToScreen(squareCurrentPos);
          if (!startScreen || !currentScreen) return null;

          const left = Math.min(startScreen.x, currentScreen.x);
          const top = Math.min(startScreen.y, currentScreen.y);
          const width = Math.abs(currentScreen.x - startScreen.x);
          const height = Math.abs(currentScreen.y - startScreen.y);

          return (
            <div
              className="fixed border-2 border-blue-400 border-dashed shadow-lg z-30 pointer-events-none opacity-70"
              style={{
                left: `${left}px`,
                top: `${top}px`,
                width: `${width}px`,
                height: `${height}px`,
                backgroundColor: "rgba(59, 130, 246, 0.2)",
              }}
            />
          );
        })()
      )}
    </div>
  );
};

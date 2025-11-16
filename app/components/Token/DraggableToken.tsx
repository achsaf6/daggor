import { useCallback, useEffect, useId, useRef, useState } from "react";
import { UserToken } from "./UserToken";
import { usePosition } from "../../hooks/usePosition";
import { ImageBounds, Position } from "../../types";
import { TokenActionsMenu } from "./TokenActionsMenu";

const LONG_PRESS_DELAY_MS = 600;

interface TransformConfig {
  scale: number;
  translateX: number;
  translateY: number;
}

interface DraggableTokenProps {
  tokenId: string;
  position: Position;
  color: string;
  imageBounds: ImageBounds | null;
  worldMapWidth?: number;
  worldMapHeight?: number;
  gridData?: {
    verticalLines: number[];
    horizontalLines: number[];
    imageWidth: number;
    imageHeight: number;
  };
  gridScale?: number;
  gridOffsetX?: number;
  gridOffsetY?: number;
  isMounted?: boolean;
  opacity?: number;
  title?: string;
  onClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onPositionUpdate: (tokenId: string, position: Position) => void;
  transform?: TransformConfig;
  onDragStateChange?: (tokenId: string, isDragging: boolean) => void;
  isInteractive?: boolean;
  zIndex?: number;
}

export const DraggableToken = ({
  tokenId,
  position,
  color,
  imageBounds,
  worldMapWidth = 0,
  worldMapHeight = 0,
  gridData,
  gridScale = 1.0,
  gridOffsetX = 0,
  gridOffsetY = 0,
  isMounted,
  opacity,
  title,
  onClick,
  onContextMenu,
  onPositionUpdate,
  transform,
  onDragStateChange,
  isInteractive = true,
  zIndex,
}: DraggableTokenProps) => {
  // Track initial mouse position to distinguish clicks from drags
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const hasMovedRef = useRef(false);
  // Track if we should prevent click events (only if we actually dragged)
  const shouldPreventClickRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [movementValue, setMovementValue] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const baseInputId = useId();
  const movementInputId = `${baseInputId}-movement`;
  const uploadInputId = `${baseInputId}-upload`;

  // Create a callback that updates this specific token's position
  const handlePositionUpdate = useCallback(
    (newPosition: Position) => {
      onPositionUpdate(tokenId, newPosition);
    },
    [tokenId, onPositionUpdate]
  );

  const {
    isDragging,
    handleMouseDown,
    handleTouchStart,
    handleMouseMove,
    handleTouchMove,
    handleMouseUp,
    handleTouchEnd,
  } = usePosition(
    imageBounds,
    handlePositionUpdate,
    worldMapWidth,
    worldMapHeight,
    transform,
    {
      gridData,
      gridScale,
      gridOffsetX,
      gridOffsetY,
    },
    position // Pass current position for viewport-relative dragging
  );

  // Wrap handleMouseMove to track if mouse has moved (to distinguish click from drag)
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = null;
    longPressTriggeredRef.current = false;
  }, []);

  const triggerLongPress = useCallback(() => {
    if (longPressTriggeredRef.current) return;
    longPressTriggeredRef.current = true;
    setIsMenuOpen(true);
    shouldPreventClickRef.current = true;
    clearLongPressTimer();
    handleMouseUp();
  }, [clearLongPressTimer, handleMouseUp]);

  const startLongPressTimer = useCallback(() => {
    if (!isInteractive || isMenuOpen) return;
    if (typeof window === "undefined") return;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      triggerLongPress();
    }, LONG_PRESS_DELAY_MS);
  }, [isInteractive, isMenuOpen, triggerLongPress, clearLongPressTimer]);

  const wrappedHandleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragStartPosRef.current) {
        const dx = Math.abs(e.clientX - dragStartPosRef.current.x);
        const dy = Math.abs(e.clientY - dragStartPosRef.current.y);
        // If mouse moved more than 5 pixels, consider it a drag
        if (dx > 5 || dy > 5) {
          hasMovedRef.current = true;
          shouldPreventClickRef.current = true;
          clearLongPressTimer();
        }
      }
      handleMouseMove(e);
    },
    [handleMouseMove, clearLongPressTimer]
  );

  // Wrap handleMouseUp to allow clicks to fire if no drag occurred
  const wrappedHandleMouseUp = useCallback(() => {
    clearLongPressTimer();
    handleMouseUp();
    
    // Reset drag tracking (keep shouldPreventClickRef until click fires)
    dragStartPosRef.current = null;
    hasMovedRef.current = false;
    
    // Don't reset shouldPreventClickRef here - let handleClick reset it
    // This ensures we can distinguish between clicks and drags when click fires
  }, [handleMouseUp, clearLongPressTimer]);

  const wrappedHandleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      clearLongPressTimer();
      handleTouchMove(e);
    },
    [clearLongPressTimer, handleTouchMove]
  );

  const wrappedHandleTouchEnd = useCallback(() => {
    clearLongPressTimer();
    handleTouchEnd();
  }, [clearLongPressTimer, handleTouchEnd]);

  // Prevent dragging if not interactive, and handle clicks vs drags
  const handleInteractiveMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Don't start drag on right-click
      if (e.button === 2) {
        return;
      }
      if (!isInteractive || isMenuOpen) return;
      
      // Prevent text selection during drag
      e.preventDefault();
      
      // Store initial position to detect if this is a click or drag
      dragStartPosRef.current = { x: e.clientX, y: e.clientY };
      hasMovedRef.current = false;
      shouldPreventClickRef.current = false;
      startLongPressTimer();
      
      handleMouseDown(e);
    },
    [isInteractive, isMenuOpen, startLongPressTimer, handleMouseDown]
  );

  // Wrap onClick to prevent it if we actually dragged
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isMenuOpen) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // Only prevent click if we actually dragged
      const shouldPrevent = shouldPreventClickRef.current;
      // Reset the flag now that we've checked it
      shouldPreventClickRef.current = false;
      
      if (shouldPrevent) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // Otherwise, let the onClick handler fire
      if (onClick) {
        onClick(e);
      }
    },
    [onClick, isMenuOpen]
  );

  const handleInteractiveTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!isInteractive || isMenuOpen) return;
      startLongPressTimer();
      handleTouchStart(e);
    },
    [isInteractive, isMenuOpen, startLongPressTimer, handleTouchStart]
  );

  // Notify parent of drag state changes
  useEffect(() => {
    if (onDragStateChange) {
      onDragStateChange(tokenId, isDragging);
    }
  }, [isDragging, tokenId, onDragStateChange]);

  // Store handlers in refs so we can attach them to document for global mouse tracking
  const handlersRef = useRef({
    handleMouseMove: wrappedHandleMouseMove,
    handleTouchMove: wrappedHandleTouchMove,
    handleMouseUp: wrappedHandleMouseUp,
    handleTouchEnd: wrappedHandleTouchEnd,
  });

  useEffect(() => {
    handlersRef.current = {
      handleMouseMove: wrappedHandleMouseMove,
      handleTouchMove: wrappedHandleTouchMove,
      handleMouseUp: wrappedHandleMouseUp,
      handleTouchEnd: wrappedHandleTouchEnd,
    };
  }, [wrappedHandleMouseMove, wrappedHandleTouchMove, wrappedHandleMouseUp, wrappedHandleTouchEnd]);

  // Attach global mouse/touch handlers when dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      // Convert native MouseEvent to React MouseEvent
      const reactEvent = {
        ...e,
        preventDefault: () => e.preventDefault(),
        stopPropagation: () => e.stopPropagation(),
        clientX: e.clientX,
        clientY: e.clientY,
      } as unknown as React.MouseEvent;
      handlersRef.current.handleMouseMove(reactEvent);
    };
    const handleGlobalTouchMove = (e: TouchEvent) => {
      // Convert native TouchEvent to React TouchEvent
      const reactEvent = {
        ...e,
        preventDefault: () => e.preventDefault(),
        stopPropagation: () => e.stopPropagation(),
        touches: e.touches,
      } as unknown as React.TouchEvent;
      handlersRef.current.handleTouchMove(reactEvent);
    };
    const handleGlobalMouseUp = () => {
      handlersRef.current.handleMouseUp();
    };
    const handleGlobalTouchEnd = () => {
      handlersRef.current.handleTouchEnd();
    };

    document.addEventListener("mousemove", handleGlobalMouseMove);
    document.addEventListener("touchmove", handleGlobalTouchMove, { passive: false });
    document.addEventListener("mouseup", handleGlobalMouseUp);
    document.addEventListener("touchend", handleGlobalTouchEnd);

    return () => {
      document.removeEventListener("mousemove", handleGlobalMouseMove);
      document.removeEventListener("touchmove", handleGlobalTouchMove);
      document.removeEventListener("mouseup", handleGlobalMouseUp);
      document.removeEventListener("touchend", handleGlobalTouchEnd);
    };
  }, [isDragging, wrappedHandleMouseMove, wrappedHandleTouchMove, wrappedHandleMouseUp, wrappedHandleTouchEnd]);

  // Wrap onContextMenu handler
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      clearLongPressTimer();
      if (onContextMenu) {
        onContextMenu(e);
      }
    },
    [onContextMenu, clearLongPressTimer]
  );

  const handleMovementChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setMovementValue(event.target.value);
  }, []);

  const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }, []);

  const handleClearImage = useCallback(() => {
    setAvatarUrl(null);
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;

    const handleOutsidePress = (event: MouseEvent | TouchEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setIsMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsidePress);
    document.addEventListener("touchstart", handleOutsidePress);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsidePress);
      document.removeEventListener("touchstart", handleOutsidePress);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const transformScale = transform?.scale ?? 1;
  const combinedScale = Math.max(0.01, transformScale * (gridScale ?? 1));
  const dropdownScale = Math.min(2.5, Math.max(0.35, 1 / combinedScale));
  const canDrag = isInteractive && !isMenuOpen;

  return (
    <UserToken
      position={position}
      color={color}
      imageSrc={avatarUrl}
      imageBounds={imageBounds}
      worldMapWidth={worldMapWidth}
      worldMapHeight={worldMapHeight}
      gridData={gridData}
      gridScale={gridScale}
      isMounted={isMounted}
      opacity={opacity}
      title={title}
      isInteractive={canDrag}
      onMouseDown={handleInteractiveMouseDown}
      onTouchStart={handleInteractiveTouchStart}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      zIndex={zIndex}
    >
      {isMenuOpen && (
        <TokenActionsMenu
          ref={menuRef}
          movementInputId={movementInputId}
          movementValue={movementValue}
          onMovementChange={handleMovementChange}
          uploadInputId={uploadInputId}
          onImageUpload={handleImageUpload}
          avatarUrl={avatarUrl}
          onClearImage={handleClearImage}
          dropdownScale={dropdownScale}
        />
      )}
    </UserToken>
  );
};


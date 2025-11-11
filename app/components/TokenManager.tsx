import { User, ImageBounds, Position } from "../types";
import { DraggableToken } from "./DraggableToken";

interface TransformConfig {
  scale: number;
  translateX: number;
  translateY: number;
}

interface TokenManagerProps {
  activeUsers: Map<string, User>;
  disconnectedUsers: Map<string, User>;
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
  isDisplay?: boolean;
  myUserId?: string | null;
  onRemoveToken?: (persistentUserId: string) => void;
  onPositionUpdate: (tokenId: string, position: Position) => void;
  transform?: TransformConfig;
  onDragStateChange?: (tokenId: string, isDragging: boolean) => void;
}

export const TokenManager = ({
  activeUsers,
  disconnectedUsers,
  imageBounds,
  worldMapWidth = 0,
  worldMapHeight = 0,
  gridData,
  gridScale = 1.0,
  gridOffsetX = 0,
  gridOffsetY = 0,
  isMounted,
  isDisplay = false,
  myUserId,
  onRemoveToken,
  onPositionUpdate,
  transform,
  onDragStateChange,
}: TokenManagerProps) => {
  if (!imageBounds) return null;

  const handleTokenClick = (e: React.MouseEvent, persistentUserId: string) => {
    // Only allow removal in display mode
    if (isDisplay && onRemoveToken && e.detail === 2) {
      // Double click to remove
      e.preventDefault();
      e.stopPropagation();
      onRemoveToken(persistentUserId);
    }
  };

  const handleTokenContextMenu = (e: React.MouseEvent, persistentUserId: string) => {
    // Right click to remove in display mode
    if (isDisplay && onRemoveToken) {
      e.preventDefault();
      e.stopPropagation();
      onRemoveToken(persistentUserId);
    }
  };

  return (
    <>
      {/* Render active users */}
      {Array.from(activeUsers.values()).map((user) => {
        const userWithPersistentId = user as User & { persistentUserId?: string };
        const persistentUserId = userWithPersistentId.persistentUserId || user.id;
        // Token is interactive if in display mode OR if it's the user's own token
        const isTokenInteractive = isDisplay || user.id === myUserId;
        // User's personal token should have highest z-index
        const tokenZIndex = user.id === myUserId ? 20 : 10;
        return (
          <DraggableToken
            key={user.id}
            tokenId={user.id}
            position={user.position}
            color={user.color}
            imageBounds={imageBounds}
            worldMapWidth={worldMapWidth}
            worldMapHeight={worldMapHeight}
            gridData={gridData}
            gridScale={gridScale}
            gridOffsetX={gridOffsetX}
            gridOffsetY={gridOffsetY}
            isMounted={isMounted}
            onClick={isDisplay ? (e) => handleTokenClick(e, persistentUserId) : undefined}
            onContextMenu={isDisplay ? (e) => handleTokenContextMenu(e, persistentUserId) : undefined}
            title={isDisplay ? "Double-click or right-click to remove" : undefined}
            onPositionUpdate={onPositionUpdate}
            transform={transform}
            onDragStateChange={onDragStateChange}
            isInteractive={isTokenInteractive}
            zIndex={tokenZIndex}
          />
        );
      })}
      {/* Render disconnected users (with reduced opacity to indicate they're disconnected) */}
      {Array.from(disconnectedUsers.values()).map((user) => {
        // Disconnected tokens are only interactive in display mode (they can't be the user's own token since they're disconnected)
        const isTokenInteractive = isDisplay;
        // Disconnected tokens should have lower z-index (default 10)
        return (
          <DraggableToken
            key={user.id}
            tokenId={user.id}
            position={user.position}
            color={user.color}
            imageBounds={imageBounds}
            worldMapWidth={worldMapWidth}
            worldMapHeight={worldMapHeight}
            gridData={gridData}
            gridScale={gridScale}
            gridOffsetX={gridOffsetX}
            gridOffsetY={gridOffsetY}
            isMounted={isMounted}
            opacity={0.6}
            onClick={isDisplay ? (e) => handleTokenClick(e, user.id) : undefined}
            onContextMenu={isDisplay ? (e) => handleTokenContextMenu(e, user.id) : undefined}
            title={isDisplay ? "Disconnected - Double-click or right-click to remove" : "Disconnected"}
            onPositionUpdate={onPositionUpdate}
            transform={transform}
            onDragStateChange={onDragStateChange}
            isInteractive={isTokenInteractive}
            zIndex={10}
          />
        );
      })}
    </>
  );
};


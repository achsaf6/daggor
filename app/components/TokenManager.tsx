import { User, ImageBounds } from "../types";
import { UserToken } from "./UserToken";

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
  isMounted?: boolean;
  isDisplay?: boolean;
  onRemoveToken?: (persistentUserId: string) => void;
}

export const TokenManager = ({
  activeUsers,
  disconnectedUsers,
  imageBounds,
  worldMapWidth = 0,
  worldMapHeight = 0,
  gridData,
  gridScale = 1.0,
  isMounted,
  isDisplay = false,
  onRemoveToken,
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
        const persistentUserId = (user as any).persistentUserId || user.id;
        return (
          <UserToken
            key={user.id}
            position={user.position}
            color={user.color}
            imageBounds={imageBounds}
            worldMapWidth={worldMapWidth}
            worldMapHeight={worldMapHeight}
            gridData={gridData}
            gridScale={gridScale}
            isMounted={isMounted}
            onClick={isDisplay ? (e) => handleTokenClick(e, persistentUserId) : undefined}
            onContextMenu={isDisplay ? (e) => handleTokenContextMenu(e, persistentUserId) : undefined}
            title={isDisplay ? "Double-click or right-click to remove" : undefined}
          />
        );
      })}
      {/* Render disconnected users (with reduced opacity to indicate they're disconnected) */}
      {Array.from(disconnectedUsers.values()).map((user) => (
        <UserToken
          key={user.id}
          position={user.position}
          color={user.color}
          imageBounds={imageBounds}
          worldMapWidth={worldMapWidth}
          worldMapHeight={worldMapHeight}
          gridData={gridData}
          gridScale={gridScale}
          isMounted={isMounted}
          opacity={0.6}
          onClick={isDisplay ? (e) => handleTokenClick(e, user.id) : undefined}
          onContextMenu={isDisplay ? (e) => handleTokenContextMenu(e, user.id) : undefined}
          title={isDisplay ? "Disconnected - Double-click or right-click to remove" : "Disconnected"}
        />
      ))}
    </>
  );
};


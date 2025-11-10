import { User, ImageBounds } from "../types";
import { UserToken } from "./UserToken";

interface UserTokensProps {
  users: Map<string, User>;
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
}

export const UserTokens = ({ 
  users, 
  imageBounds,
  worldMapWidth = 0,
  worldMapHeight = 0,
  gridData,
  gridScale = 1.0,
}: UserTokensProps) => {
  if (!imageBounds) return null;

  return (
    <>
      {Array.from(users.values()).map((user) => (
        <UserToken
          key={user.id}
          position={user.position}
          color={user.color}
          imageBounds={imageBounds}
          worldMapWidth={worldMapWidth}
          worldMapHeight={worldMapHeight}
          gridData={gridData}
          gridScale={gridScale}
        />
      ))}
    </>
  );
};


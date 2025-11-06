import { Position, ImageBounds } from "../types";
import {
  getViewportPosition,
  getViewportSize,
  getCircleSizePercent,
} from "../utils/coordinates";

interface UserCircleProps {
  position: Position;
  color: string;
  imageBounds: ImageBounds | null;
  isInteractive?: boolean;
  onMouseDown?: (e: React.MouseEvent) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
}

export const UserCircle = ({
  position,
  color,
  imageBounds,
  isInteractive = false,
  onMouseDown,
  onTouchStart,
}: UserCircleProps) => {
  if (!imageBounds) return null;

  const viewportPos = getViewportPosition(position, imageBounds);
  const circleSize = getViewportSize(getCircleSizePercent(), imageBounds);

  return (
    <div
      className={`absolute rounded-full border-2 border-white shadow-lg z-10 ${
        isInteractive ? "cursor-move" : ""
      }`}
      style={{
        left: `${viewportPos.x}%`,
        top: `${viewportPos.y}%`,
        width: `${circleSize}%`,
        aspectRatio: "1 / 1",
        transform: "translate(-50%, -50%)",
        backgroundColor: color,
        touchAction: isInteractive ? "none" : "auto",
      }}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
    />
  );
};


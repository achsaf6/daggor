export type TokenSize = "tiny" | "small" | "medium" | "large" | "huge" | "gargantuan";

export interface TokenTemplate {
  color: string;
  size: TokenSize;
  imageUrl?: string | null;
  monsterId?: string | null;
  name?: string | null;
}

export interface User {
  id: string;
  color: string;
  position: { x: number; y: number };
  imageSrc?: string | null;
  size?: TokenSize;
  name?: string | null;
}

export interface ImageBounds {
  left: number;
  top: number;
  width: number;
  height: number;
  containerLeft: number;
  containerTop: number;
  containerWidth: number;
  containerHeight: number;
}

export interface Position {
  x: number;
  y: number;
}


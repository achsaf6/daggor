export interface User {
  id: string;
  color: string;
  position: { x: number; y: number };
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


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

export interface Cover {
  id: string;
  x: number; // top-left corner x position (image-relative percentage)
  y: number; // top-left corner y position (image-relative percentage)
  width: number; // width (image-relative percentage)
  height: number; // height (image-relative percentage)
  color?: string; // optional color, defaults to solid gray (#808080)
}


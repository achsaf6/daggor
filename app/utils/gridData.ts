import { createDefaultGridData, DEFAULT_BATTLEMAP_GRID_DATA } from "../../lib/defaultBattlemap";

export interface GridData {
  verticalLines: number[];
  horizontalLines: number[];
  imageWidth: number;
  imageHeight: number;
}

const cloneDefaultGridData = (): GridData => {
  const base =
    typeof createDefaultGridData === "function"
      ? createDefaultGridData()
      : DEFAULT_BATTLEMAP_GRID_DATA;

  return {
    verticalLines: [...base.verticalLines],
    horizontalLines: [...base.horizontalLines],
    imageWidth: base.imageWidth,
    imageHeight: base.imageHeight,
  };
};

export const DEFAULT_GRID_DATA: GridData = cloneDefaultGridData();

export const sanitizeGridData = (input: unknown): GridData => {
  if (!input || typeof input !== "object") {
    return cloneDefaultGridData();
  }

  const data = input as Partial<GridData>;

  const verticalLines =
    Array.isArray(data.verticalLines) && data.verticalLines.length > 0
      ? [...data.verticalLines]
      : [...DEFAULT_GRID_DATA.verticalLines];
  const horizontalLines =
    Array.isArray(data.horizontalLines) && data.horizontalLines.length > 0
      ? [...data.horizontalLines]
      : [...DEFAULT_GRID_DATA.horizontalLines];
  const imageWidth =
    typeof data.imageWidth === "number" && data.imageWidth > 0
      ? data.imageWidth
      : DEFAULT_GRID_DATA.imageWidth;
  const imageHeight =
    typeof data.imageHeight === "number" && data.imageHeight > 0
      ? data.imageHeight
      : DEFAULT_GRID_DATA.imageHeight;

  return {
    verticalLines,
    horizontalLines,
    imageWidth,
    imageHeight,
  };
};


export interface GridData {
  verticalLines: number[];
  horizontalLines: number[];
  imageWidth: number;
  imageHeight: number;
}

export const DEFAULT_GRID_DATA: GridData = {
  verticalLines: [],
  horizontalLines: [],
  imageWidth: 0,
  imageHeight: 0,
};

export const sanitizeGridData = (input: unknown): GridData => {
  if (!input || typeof input !== "object") {
    return {
      verticalLines: [],
      horizontalLines: [],
      imageWidth: 0,
      imageHeight: 0,
    };
  }

  const data = input as Partial<GridData>;

  return {
    verticalLines: Array.isArray(data.verticalLines) ? [...data.verticalLines] : [],
    horizontalLines: Array.isArray(data.horizontalLines) ? [...data.horizontalLines] : [],
    imageWidth: typeof data.imageWidth === "number" ? data.imageWidth : 0,
    imageHeight: typeof data.imageHeight === "number" ? data.imageHeight : 0,
  };
};

export const hasGridData = (gridData: GridData | null | undefined): boolean => {
  if (!gridData) {
    return false;
  }

  const hasVertical = Array.isArray(gridData.verticalLines) && gridData.verticalLines.length > 0;
  const hasHorizontal =
    Array.isArray(gridData.horizontalLines) && gridData.horizontalLines.length > 0;
  const hasDimensions =
    typeof gridData.imageWidth === "number" &&
    gridData.imageWidth > 0 &&
    typeof gridData.imageHeight === "number" &&
    gridData.imageHeight > 0;

  return hasVertical && hasHorizontal && hasDimensions;
};

interface FetchGridDataOptions {
  mapPath?: string | null;
  signal?: AbortSignal;
}

export const fetchGridData = async (
  options: FetchGridDataOptions = {}
): Promise<GridData> => {
  const params = new URLSearchParams();
  if (options.mapPath) {
    params.set("path", options.mapPath);
  }

  const query = params.toString();
  const response = await fetch(`/api/gridlines${query ? `?${query}` : ""}`, {
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error("Failed to fetch gridlines");
  }

  const data = await response.json();
  return sanitizeGridData(data);
};


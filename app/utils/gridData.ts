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

export const fetchGridData = async (signal?: AbortSignal): Promise<GridData> => {
  const response = await fetch("/api/gridlines", { signal });
  if (!response.ok) {
    throw new Error("Failed to fetch gridlines");
  }

  const data = await response.json();
  return sanitizeGridData(data);
};


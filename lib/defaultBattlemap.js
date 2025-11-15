export const DEFAULT_BATTLEMAP_NAME = "Default Battlemap";

export const DEFAULT_BATTLEMAP_MAP_PATH = "/maps/Training Ground.jpg";

const DEFAULT_GRID_DIMENSION = 100;
const DEFAULT_GRID_STEP = 5;

const generateGridLines = (dimension, step) => {
  const lines = [];
  for (let value = 0; value <= dimension; value += step) {
    lines.push(value);
  }
  return lines;
};

export const createDefaultGridData = () => {
  const verticalLines = generateGridLines(DEFAULT_GRID_DIMENSION, DEFAULT_GRID_STEP);
  const horizontalLines = generateGridLines(DEFAULT_GRID_DIMENSION, DEFAULT_GRID_STEP);

  return {
    verticalLines,
    horizontalLines,
    imageWidth: DEFAULT_GRID_DIMENSION,
    imageHeight: DEFAULT_GRID_DIMENSION,
  };
};

export const DEFAULT_BATTLEMAP_GRID_DATA = createDefaultGridData();


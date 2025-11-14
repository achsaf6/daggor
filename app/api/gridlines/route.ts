import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { join } from 'path';
import { readFileSync } from 'fs';
import { DEFAULT_BATTLEMAP_MAP_PATH } from '../../../lib/defaultBattlemap';

export const runtime = "nodejs";

interface GridData {
  verticalLines: number[];
  horizontalLines: number[];
  imageWidth: number;
  imageHeight: number;
}

/**
 * Detect vertical and horizontal lines in an image using edge detection
 */
async function detectGridLines(imageBuffer: Buffer): Promise<GridData> {
  // Get image metadata
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width!;
  const height = metadata.height!;

  // Convert to grayscale and apply edge detection
  // Using sharp's built-in operations for edge detection
  const grayscale = await sharp(imageBuffer)
    .greyscale()
    .normalize()
    .toBuffer();

  // Apply Sobel edge detection manually for better control
  const edgeData = await applySobelEdgeDetection(grayscale, width, height);
  
  // Detect vertical lines (strong vertical edges)
  const verticalLineCandidates = detectVerticalLines(edgeData, width, height);
  
  // Detect horizontal lines (strong horizontal edges)
  const horizontalLineCandidates = detectHorizontalLines(edgeData, width, height);

  // Calculate spacing for each direction
  const verticalSpacing = calculateGridSpacing(verticalLineCandidates);
  const horizontalSpacing = calculateGridSpacing(horizontalLineCandidates);

  // Use the larger spacing for both directions to ensure square grids
  const unifiedSpacing = Math.max(verticalSpacing, horizontalSpacing);

  // Generate grid lines using the unified spacing
  const verticalLines = generateGridLines(verticalLineCandidates, unifiedSpacing, width);
  const horizontalLines = generateGridLines(horizontalLineCandidates, unifiedSpacing, height);

  return {
    verticalLines,
    horizontalLines,
    imageWidth: width,
    imageHeight: height,
  };
}

/**
 * Apply Sobel edge detection to detect edges
 */
async function applySobelEdgeDetection(
  imageBuffer: Buffer,
  width: number,
  height: number
): Promise<{ vertical: number[]; horizontal: number[] }> {
  const pixels = await sharp(imageBuffer)
    .raw()
    .toBuffer();

  const verticalEdges = new Array(width * height).fill(0);
  const horizontalEdges = new Array(width * height).fill(0);

  // Sobel kernels
  const sobelX = [
    [-1, 0, 1],
    [-2, 0, 2],
    [-1, 0, 1],
  ];

  const sobelY = [
    [-1, -2, -1],
    [0, 0, 0],
    [1, 2, 1],
  ];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0;
      let gy = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = (y + ky) * width + (x + kx);
          const pixel = pixels[idx];
          gx += pixel * sobelX[ky + 1][kx + 1];
          gy += pixel * sobelY[ky + 1][kx + 1];
        }
      }

      const idx = y * width + x;
      verticalEdges[idx] = Math.abs(gx);
      horizontalEdges[idx] = Math.abs(gy);
    }
  }

  return { vertical: verticalEdges, horizontal: horizontalEdges };
}

/**
 * Detect vertical lines by finding columns with strong vertical edges
 */
function detectVerticalLines(
  edgeData: { vertical: number[]; horizontal: number[] },
  width: number,
  height: number
): number[] {
  const threshold = 50; // Adjust based on image characteristics
  const lineCandidates: number[] = [];

  // For each column, check if it has consistent vertical edges
  for (let x = 0; x < width; x++) {
    let edgeCount = 0;
    let totalStrength = 0;

    for (let y = 0; y < height; y++) {
      const idx = y * width + x;
      if (edgeData.vertical[idx] > threshold) {
        edgeCount++;
        totalStrength += edgeData.vertical[idx];
      }
    }

    // If column has significant vertical edges, it's a candidate
    if (edgeCount > height * 0.1 && totalStrength > threshold * edgeCount) {
      lineCandidates.push(x);
    }
  }

  return lineCandidates;
}

/**
 * Detect horizontal lines by finding rows with strong horizontal edges
 */
function detectHorizontalLines(
  edgeData: { vertical: number[]; horizontal: number[] },
  width: number,
  height: number
): number[] {
  const threshold = 50; // Adjust based on image characteristics
  const lineCandidates: number[] = [];

  // For each row, check if it has consistent horizontal edges
  for (let y = 0; y < height; y++) {
    let edgeCount = 0;
    let totalStrength = 0;

    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (edgeData.horizontal[idx] > threshold) {
        edgeCount++;
        totalStrength += edgeData.horizontal[idx];
      }
    }

    // If row has significant horizontal edges, it's a candidate
    if (edgeCount > width * 0.1 && totalStrength > threshold * edgeCount) {
      lineCandidates.push(y);
    }
  }

  return lineCandidates;
}

/**
 * Calculate grid spacing from detected lines by finding common intervals
 * Returns the spacing value, or 0 if not found
 */
function calculateGridSpacing(lines: number[]): number {
  if (lines.length < 2) return 0;

  // Sort lines
  const sortedLines = [...lines].sort((a, b) => a - b);

  // Calculate intervals between consecutive lines
  const intervals: number[] = [];
  for (let i = 1; i < sortedLines.length; i++) {
    intervals.push(sortedLines[i] - sortedLines[i - 1]);
  }

  // Find the most common interval (grid spacing)
  const intervalCounts = new Map<number, number>();
  for (const interval of intervals) {
    // Round to nearest 5 pixels to account for slight variations
    const rounded = Math.round(interval / 5) * 5;
    intervalCounts.set(rounded, (intervalCounts.get(rounded) || 0) + 1);
  }

  // Find the most common interval
  let maxCount = 0;
  let gridSpacing = 0;
  for (const [interval, count] of intervalCounts.entries()) {
    if (count > maxCount && interval > 10) {
      maxCount = count;
      gridSpacing = interval;
    }
  }

  return gridSpacing;
}

/**
 * Generate grid lines using a specific spacing
 */
function generateGridLines(
  detectedLines: number[],
  spacing: number,
  dimension: number
): number[] {
  if (spacing <= 0) {
    // Fallback: return detected lines if we can't infer spacing
    return [...detectedLines].sort((a, b) => a - b);
  }

  const gridLines: number[] = [];
  
  // Find the first detected line to use as a reference point
  const sortedDetected = [...detectedLines].sort((a, b) => a - b);
  const startLine = sortedDetected.length > 0 ? sortedDetected[0] : 0;
  
  // Calculate the offset from the start
  const offset = startLine % spacing;
  
  // Generate lines from the beginning of the dimension
  for (let pos = offset; pos < dimension; pos += spacing) {
    gridLines.push(pos);
  }

  return gridLines.sort((a, b) => a - b);
}

const defaultGridData: GridData = {
  verticalLines: [],
  horizontalLines: [],
  imageWidth: 0,
  imageHeight: 0,
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const requestedPath = searchParams.get('path');

    let imageBuffer: Buffer;
    if (requestedPath && requestedPath.startsWith('http')) {
      const response = await fetch(requestedPath);
      if (!response.ok) {
        throw new Error('Failed to fetch remote map image');
      }
      const arrayBuffer = await response.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    } else {
      const defaultPath = DEFAULT_BATTLEMAP_MAP_PATH.replace(/^\/+/, '');
      const relativePath =
        requestedPath && requestedPath.trim().length > 0
          ? requestedPath.replace(/^\/+/, '')
          : defaultPath;
      const imagePath = join(process.cwd(), 'public', relativePath);
      imageBuffer = readFileSync(imagePath);
    }

    const gridData = await detectGridLines(imageBuffer);

    return NextResponse.json(gridData);
  } catch (error) {
    console.error('Error detecting gridlines:', error);
    return NextResponse.json(defaultGridData);
  }
}


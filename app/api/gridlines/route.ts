import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { join, resolve } from 'path';
import { readFileSync } from 'fs';
import { DEFAULT_BATTLEMAP_MAP_PATH } from '../../../lib/defaultBattlemap';

export const runtime = "nodejs";

// Cap remote image fetches so a malicious URL cannot OOM the server.
const MAX_REMOTE_IMAGE_BYTES = 20 * 1024 * 1024;

// Crop fraction applied to all four sides before detection. Removes the outer
// frame, title bar, scale legend and other border decorations that produce
// strong but non-repeating edges along the image rim.
const CROP_FRACTION = 0.08;

// Min plausible grid-cell width in image-natural pixels.
const MIN_PERIOD = 12;

// Plausible cell count along any axis. Outside this range the detected period
// is almost certainly noise (small P) or feature spacing (large P), not a
// real printed grid.
const MIN_CELLS = 5;
const MAX_CELLS = 80;

// After collecting peaks, merge any two within this many pixels into one.
// Larger than expected grid cell width is fine: it collapses the multi-peak
// clusters that decorative frame edges and building outlines produce. We
// previously used 12 (which only handles double-edges of single grid lines),
// but real images have wider clusters from frame thickness, building walls,
// and inset boxes — those need to collapse to one peak each.
const PEAK_MERGE_WINDOW = 25;

// A column/row is considered a candidate grid line if it has at least this many
// times the median row-vote count.
const VOTE_THRESHOLD_MULTIPLIER = 2;

// Need at least this many candidate grid lines for a result to be trustworthy.
const MIN_PEAKS = 6;

// Final confidence (peaks-on-comb / total-peaks) below this returns empty.
const CONFIDENCE_FLOOR = 0.30;

// Trigger the square-grid override only when BOTH conditions hold:
//   - axes' detected periods disagree by more than this ratio
//   - one axis's confidence beats the other by more than this margin
// Otherwise we trust each axis independently. The dual condition prevents
// e.g. a rectangular-cell map (different cell-count per axis but matching
// period like 30×50 grids) from being clobbered when both axes are equally
// confident.
const SQUARE_GRID_RATIO_THRESHOLD = 1.2;
const SQUARE_GRID_CONF_GAP = 0.15;

async function fetchRemoteImageBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch remote map image (${response.status})`);
  }

  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader) {
    const declared = Number(contentLengthHeader);
    if (Number.isFinite(declared) && declared > MAX_REMOTE_IMAGE_BYTES) {
      throw new Error('Remote image exceeds maximum allowed size');
    }
  }

  if (!response.body) {
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_REMOTE_IMAGE_BYTES) {
      throw new Error('Remote image exceeds maximum allowed size');
    }
    return Buffer.from(arrayBuffer);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_REMOTE_IMAGE_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // Ignore cancellation errors — we are bailing out anyway.
      }
      throw new Error('Remote image exceeds maximum allowed size');
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

interface GridData {
  verticalLines: number[];
  horizontalLines: number[];
  imageWidth: number;
  imageHeight: number;
}

interface DetectionResult extends GridData {
  // Fraction of detected peaks that fall on the comb at the chosen period.
  // 0–1; min(x, y) so a one-axis hit doesn't claim global success.
  confidence: number;
  // Detected period in image-natural pixels per axis. 0 = couldn't detect.
  spacing: { x: number; y: number };
}

const emptyResult: DetectionResult = {
  verticalLines: [],
  horizontalLines: [],
  imageWidth: 0,
  imageHeight: 0,
  confidence: 0,
  spacing: { x: 0, y: 0 },
};

interface AxisResult {
  period: number;
  phase: number;
  confidence: number;
  peaks: number[];
  votes: Float64Array;
  lo: number;
  hi: number;
  dim: number;
}

/**
 * Detect a printed grid via per-row Sobel-edge voting + median-gap analysis.
 *
 * Pipeline:
 *   1. Compute |Sobel| edge magnitudes.
 *   2. Crop the outer 8% on all four sides — drops the printed frame, title
 *      bar, scale legend, and inset.
 *   3. Per row of |gx|: vote at every column whose edge magnitude is a local
 *      max above row-mean × 1.5. (Symmetric per column for the Y axis.)
 *      Each row gets at most one vote per column, so outlier *intensities*
 *      (frame borders, building walls) cannot dominate — what matters is how
 *      many rows agree.
 *   4. Threshold the vote signal at 2× median; find local maxima; merge any
 *      two peaks within 25 px (this collapses thick cluster edges from
 *      frames/walls into one peak each, while still preserving real grid
 *      lines spaced by the typical 30+ px period).
 *   5. Compute consecutive-peak gaps. Take the **median** gap as the period
 *      estimate — robust to missing grid lines (faint ones below threshold)
 *      and extra peaks (occasional non-grid features that survived).
 *   6. Phase-fit the period via comb sum.
 *   7. If the two axes disagree by > 25%, take it as a sign that one axis
 *      locked onto a half- or double-period harmonic; copy the
 *      higher-confidence axis's period across both. (Battlemap grids are
 *      almost always square.)
 */
async function detectGridLines(imageBuffer: Buffer): Promise<DetectionResult> {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width <= 0 || height <= 0) return emptyResult;

  const grayscale = await sharp(imageBuffer)
    .greyscale()
    .normalize()
    .toBuffer();

  const edgeData = await applySobelEdgeDetection(grayscale, width, height);

  let xResult = detectAxis(edgeData.vertical, width, height, 'x');
  let yResult = detectAxis(edgeData.horizontal, width, height, 'y');

  // Square-grid harmonic correction. If one axis locked onto a 2× harmonic
  // (or worse) while the other got the fundamental, periods will disagree —
  // but only override the loser when the winning axis is *also* meaningfully
  // more confident, otherwise we'd corrupt legitimate per-axis detections on
  // grids that happen to span different cell counts (e.g. 30×50).
  if (xResult.period > 0 && yResult.period > 0) {
    const ratio = Math.max(
      xResult.period / yResult.period,
      yResult.period / xResult.period
    );
    const confGap = Math.abs(xResult.confidence - yResult.confidence);
    if (ratio > SQUARE_GRID_RATIO_THRESHOLD && confGap > SQUARE_GRID_CONF_GAP) {
      const winner = xResult.confidence >= yResult.confidence ? xResult : yResult;
      const loser = winner === xResult ? yResult : xResult;
      const corrected = retargetAxis(loser, winner.period);
      if (winner === xResult) yResult = corrected;
      else xResult = corrected;
    }
  } else if (xResult.period > 0 && yResult.period === 0) {
    yResult = retargetAxis(yResult, xResult.period);
  } else if (yResult.period > 0 && xResult.period === 0) {
    xResult = retargetAxis(xResult, yResult.period);
  }

  if (xResult.period === 0 || yResult.period === 0) {
    return { ...emptyResult, imageWidth: width, imageHeight: height };
  }

  // After square-correction, one axis was retargeted onto the other's period —
  // its post-correction confidence will be lower. Take the max so the reported
  // confidence reflects the winning axis (the basis for the correction), not
  // the rederived loser.
  const reportedConf = Math.max(xResult.confidence, yResult.confidence);
  if (reportedConf < CONFIDENCE_FLOOR) {
    return {
      ...emptyResult,
      imageWidth: width,
      imageHeight: height,
      confidence: reportedConf,
      spacing: { x: xResult.period, y: yResult.period },
    };
  }

  const verticalLines = generateLines(xResult.phase, xResult.period, width);
  const horizontalLines = generateLines(yResult.phase, yResult.period, height);

  return {
    verticalLines,
    horizontalLines,
    imageWidth: width,
    imageHeight: height,
    confidence: reportedConf,
    spacing: { x: xResult.period, y: yResult.period },
  };
}

function detectAxis(
  edges: Float64Array,
  W: number,
  H: number,
  axis: 'x' | 'y'
): AxisResult {
  const dim = axis === 'x' ? W : H;
  const cropPx = Math.floor(dim * CROP_FRACTION);
  const lo = cropPx;
  const hi = dim - cropPx;
  const votes = buildVoteSignal(edges, W, H, axis);

  // Adaptive threshold from the vote-signal median.
  const kept: number[] = [];
  for (let i = lo; i < hi; i++) kept.push(votes[i]);
  kept.sort((a, b) => a - b);
  const median = kept[Math.floor(kept.length / 2)] || 0;
  const threshold = Math.max(median * VOTE_THRESHOLD_MULTIPLIER, 5);

  // Local-max peaks above threshold.
  const rawPeaks: number[] = [];
  for (let i = lo + 1; i < hi - 1; i++) {
    if (votes[i] <= threshold) continue;
    if (votes[i] < votes[i - 1] || votes[i] < votes[i + 1]) continue;
    rawPeaks.push(i);
  }

  // Merge close peaks. Window is wider than expected grid cell width on purpose
  // — it collapses entire feature clusters (frames, wall outlines) into a
  // single peak each.
  const peaks: number[] = [];
  for (const p of rawPeaks) {
    const last = peaks[peaks.length - 1];
    if (last !== undefined && p - last <= PEAK_MERGE_WINDOW) {
      if (votes[p] > votes[last]) peaks[peaks.length - 1] = p;
    } else {
      peaks.push(p);
    }
  }

  if (peaks.length < MIN_PEAKS) {
    return { period: 0, phase: 0, confidence: 0, peaks, votes, lo, hi, dim };
  }

  // Median gap → robust period estimate.
  const gaps: number[] = [];
  for (let i = 1; i < peaks.length; i++) gaps.push(peaks[i] - peaks[i - 1]);
  gaps.sort((a, b) => a - b);
  const period = gaps[Math.floor(gaps.length / 2)];
  if (period < MIN_PERIOD) {
    return { period: 0, phase: 0, confidence: 0, peaks, votes, lo, hi, dim };
  }
  const cellCount = dim / period;
  if (cellCount < MIN_CELLS || cellCount > MAX_CELLS) {
    return { period: 0, phase: 0, confidence: 0, peaks, votes, lo, hi, dim };
  }

  // Phase fit + confidence as fraction of peaks on the chosen comb.
  let bestPhase = 0;
  let bestHits = 0;
  for (let phase = 0; phase < period; phase++) {
    let hits = 0;
    for (const p of peaks) {
      const r = ((p - phase) % period + period) % period;
      if (r <= 3 || r >= period - 3) hits++;
    }
    if (hits > bestHits) {
      bestHits = hits;
      bestPhase = phase;
    }
  }
  const confidence = bestHits / peaks.length;

  return { period, phase: bestPhase, confidence, peaks, votes, lo, hi, dim };
}

/** Re-fit a fixed period onto an axis's existing vote signal. */
function retargetAxis(prev: AxisResult, period: number): AxisResult {
  let bestPhase = 0;
  let bestSum = -Infinity;
  for (let phase = 0; phase < period; phase++) {
    let sum = 0;
    for (let pos = phase; pos < prev.dim; pos += period) sum += prev.votes[pos];
    if (sum > bestSum) {
      bestSum = sum;
      bestPhase = phase;
    }
  }
  // Recompute confidence as fraction of original peaks on the new comb.
  let hits = 0;
  for (const p of prev.peaks) {
    const r = ((p - bestPhase) % period + period) % period;
    if (r <= 3 || r >= period - 3) hits++;
  }
  const confidence = prev.peaks.length > 0 ? hits / prev.peaks.length : 0;
  return { ...prev, period, phase: bestPhase, confidence };
}

function buildVoteSignal(
  edges: Float64Array,
  W: number,
  H: number,
  axis: 'x' | 'y'
): Float64Array {
  const cropX = Math.floor(W * CROP_FRACTION);
  const cropY = Math.floor(H * CROP_FRACTION);
  const dim = axis === 'x' ? W : H;
  const votes = new Float64Array(dim);

  if (axis === 'x') {
    for (let y = cropY; y < H - cropY; y++) {
      let mean = 0;
      for (let x = 0; x < W; x++) mean += edges[y * W + x];
      mean /= W;
      const t = mean * 1.5;
      for (let x = 1; x < W - 1; x++) {
        const v = edges[y * W + x];
        if (v > t && v >= edges[y * W + x - 1] && v >= edges[y * W + x + 1]) {
          votes[x]++;
        }
      }
    }
  } else {
    for (let x = cropX; x < W - cropX; x++) {
      let mean = 0;
      for (let y = 0; y < H; y++) mean += edges[y * W + x];
      mean /= H;
      const t = mean * 1.5;
      for (let y = 1; y < H - 1; y++) {
        const v = edges[y * W + x];
        if (v > t && v >= edges[(y - 1) * W + x] && v >= edges[(y + 1) * W + x]) {
          votes[y]++;
        }
      }
    }
  }

  // Zero out the cropped axis edges (where the side frame columns/rows live).
  const inAxisCrop = axis === 'x' ? cropX : cropY;
  for (let i = 0; i < inAxisCrop; i++) votes[i] = 0;
  for (let i = dim - inAxisCrop; i < dim; i++) votes[i] = 0;

  return votes;
}

/**
 * Apply Sobel edge detection. Returns per-pixel |gx| and |gy| arrays.
 */
async function applySobelEdgeDetection(
  imageBuffer: Buffer,
  width: number,
  height: number
): Promise<{ vertical: Float64Array; horizontal: Float64Array }> {
  const pixels = await sharp(imageBuffer).raw().toBuffer();
  const verticalEdges = new Float64Array(width * height);
  const horizontalEdges = new Float64Array(width * height);

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

function generateLines(phase: number, period: number, dim: number): number[] {
  if (period <= 0) return [];
  const lines: number[] = [];
  for (let pos = phase; pos < dim; pos += period) lines.push(pos);
  for (let pos = phase - period; pos >= 0; pos -= period) lines.unshift(pos);
  return lines;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const requestedPath = searchParams.get('path');

    let imageBuffer: Buffer;
    if (requestedPath && /^https?:\/\//i.test(requestedPath)) {
      imageBuffer = await fetchRemoteImageBuffer(requestedPath);
    } else {
      const defaultPath = DEFAULT_BATTLEMAP_MAP_PATH.replace(/^\/+/, '');
      const relativePath =
        requestedPath && requestedPath.trim().length > 0
          ? requestedPath.replace(/^\/+/, '')
          : defaultPath;
      // Resolve and verify the final path stays within /public so a crafted
      // ../../../etc/passwd cannot escape the asset directory.
      const publicRoot = resolve(join(process.cwd(), 'public'));
      const imagePath = resolve(join(publicRoot, relativePath));
      if (imagePath !== publicRoot && !imagePath.startsWith(publicRoot + '/')) {
        return NextResponse.json(emptyResult, { status: 400 });
      }
      imageBuffer = readFileSync(imagePath);
    }

    const result = await detectGridLines(imageBuffer);

    if (
      result.spacing.x === 0 ||
      result.spacing.y === 0 ||
      result.confidence < CONFIDENCE_FLOOR
    ) {
      return NextResponse.json({
        ...emptyResult,
        imageWidth: result.imageWidth,
        imageHeight: result.imageHeight,
        confidence: result.confidence,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error detecting gridlines:', error);
    return NextResponse.json(emptyResult);
  }
}

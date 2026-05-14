// Client-side interactive grid detector.
//
// Algorithm ported from grid-detector/sobel_explorer.html. The pipeline:
//   precompute(imageData) -> { Gx, Gy, mag, sortedMag } once per image
//   runDetection(precomputed, params) -> { verticalLines, horizontalLines, ... } per slider change
//
// Pure functions, no DOM. Callers own the canvas and read pixels via getImageData
// before calling precompute.

export type DetectorMode = "magnitude" | "binary" | "grid";

export interface DetectorParams {
  /** Angle tolerance in degrees from vertical/horizontal (0-45). */
  angleTolDeg: number;
  /** Magnitude percentile threshold (0-100). Keep top (100 - magPercentile)% of gradient pixels. */
  magPercentile: number;
  /** Peak detection height percentile of nonzero projection sums (50-99.5). Grid mode only. */
  peakPercentile: number;
  /** Minimum spacing between detected peaks, in pixels. Grid mode only. */
  minLineSpacing: number;
}

export interface Precomputed {
  W: number;
  H: number;
  Gx: Float32Array;
  Gy: Float32Array;
  mag: Float32Array;
  sortedMag: Float32Array;
}

export interface FittedAxis {
  pitch: number;
  offset: number;
  lines: number[];
  rms: number;
  rawPeaks: number[];
}

export interface DetectionResult {
  fitV: FittedAxis | null;
  fitH: FittedAxis | null;
  magThresh: number;
}

export const precompute = (imageData: ImageData): Precomputed => {
  const W = imageData.width;
  const H = imageData.height;
  const data = imageData.data;
  const N = W * H;

  const gray = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  const Gx = new Float32Array(N);
  const Gy = new Float32Array(N);
  const mag = new Float32Array(N);

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const tl = gray[i - W - 1];
      const tc = gray[i - W];
      const tr = gray[i - W + 1];
      const ml = gray[i - 1];
      const mr = gray[i + 1];
      const bl = gray[i + W - 1];
      const bc = gray[i + W];
      const br = gray[i + W + 1];
      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      Gx[i] = gx;
      Gy[i] = gy;
      mag[i] = Math.hypot(gx, gy);
    }
  }

  const sortedMag = new Float32Array(mag);
  sortedMag.sort();

  return { W, H, Gx, Gy, mag, sortedMag };
};

const magThresholdAtPercentile = (
  sortedMag: Float32Array,
  percentile: number
): number => {
  const N = sortedMag.length;
  let idx = Math.floor((percentile / 100) * (N - 1));
  if (idx < 0) idx = 0;
  if (idx >= N) idx = N - 1;
  return sortedMag[idx];
};

export const detectPeaks = (
  profile: Float32Array,
  peakPercentile: number,
  minSep: number
): { peaks: number[]; heightThresh: number } => {
  const nonzero: number[] = [];
  for (let i = 0; i < profile.length; i++) {
    if (profile[i] > 0) nonzero.push(profile[i]);
  }

  let heightThresh = 0;
  if (nonzero.length) {
    nonzero.sort((a, b) => a - b);
    const idx = Math.floor((peakPercentile / 100) * (nonzero.length - 1));
    heightThresh = nonzero[idx];
  }

  const cands: number[] = [];
  for (let i = 0; i < profile.length; i++) {
    if (profile[i] >= heightThresh && profile[i] > 0) cands.push(i);
  }
  cands.sort((a, b) => profile[b] - profile[a]);

  const peaks: number[] = [];
  const taken = new Uint8Array(profile.length);
  for (const i of cands) {
    if (taken[i]) continue;
    peaks.push(i);
    const lo = Math.max(0, i - minSep);
    const hi = Math.min(profile.length - 1, i + minSep);
    for (let k = lo; k <= hi; k++) taken[k] = 1;
  }
  peaks.sort((a, b) => a - b);
  return { peaks, heightThresh };
};

export const fitRegularGrid = (
  peaks: number[],
  profileLength: number
): FittedAxis | null => {
  if (peaks.length < 2) return null;
  const p = [...peaks].sort((a, b) => a - b);

  const diffs: number[] = [];
  for (let i = 1; i < p.length; i++) diffs.push(p[i] - p[i - 1]);
  diffs.sort((a, b) => a - b);
  let s = diffs[Math.floor(diffs.length / 2)];
  if (!(s > 0)) return null;
  let o = ((p[0] % s) + s) % s;

  for (let it = 0; it < 12; it++) {
    let sumK = 0,
      sumP = 0,
      sumKK = 0,
      sumKP = 0;
    const n = p.length;
    for (let i = 0; i < n; i++) {
      const k = Math.round((p[i] - o) / s);
      sumK += k;
      sumP += p[i];
      sumKK += k * k;
      sumKP += k * p[i];
    }
    const denom = n * sumKK - sumK * sumK;
    if (denom === 0) break;
    const newS = (n * sumKP - sumK * sumP) / denom;
    const newO = (sumP - newS * sumK) / n;
    if (!isFinite(newS) || newS <= 0) break;
    const dS = Math.abs(newS - s);
    const dO = Math.abs(newO - o);
    s = newS;
    o = newO;
    if (dS < 0.005 && dO < 0.005) break;
  }

  const lines: number[] = [];
  const kStart = Math.ceil(-o / s);
  const kEnd = Math.floor((profileLength - 1 - o) / s);
  for (let k = kStart; k <= kEnd; k++) lines.push(o + k * s);

  let sse = 0;
  for (const pi of p) {
    const k = Math.round((pi - o) / s);
    const d = pi - (o + k * s);
    sse += d * d;
  }
  const rms = Math.sqrt(sse / p.length);

  return { pitch: s, offset: o, lines, rms, rawPeaks: p };
};

export const runDetection = (
  pre: Precomputed,
  params: DetectorParams
): DetectionResult => {
  const { W, H, Gx, Gy, mag, sortedMag } = pre;
  const tol = Math.tan((params.angleTolDeg * Math.PI) / 180);
  const magThresh = magThresholdAtPercentile(sortedMag, params.magPercentile);
  const eps = 1e-8;

  const colSum = new Float32Array(W);
  const rowSum = new Float32Array(H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const m = mag[i];
      if (m <= magThresh) continue;
      const ax = Math.abs(Gx[i]);
      const ay = Math.abs(Gy[i]);
      if (ay / (ax + eps) < tol) colSum[x] += 1;
      else if (ax / (ay + eps) < tol) rowSum[y] += 1;
    }
  }

  const v = detectPeaks(colSum, params.peakPercentile, params.minLineSpacing);
  const h = detectPeaks(rowSum, params.peakPercentile, params.minLineSpacing);
  const fitV = fitRegularGrid(v.peaks, W);
  const fitH = fitRegularGrid(h.peaks, H);
  if (fitV) fitV.rawPeaks = v.peaks;
  if (fitH) fitH.rawPeaks = h.peaks;

  return { fitV, fitH, magThresh };
};

// Renders the axis-filtered Sobel magnitude (or binary mask) into out.data
// for the canvas preview. Returns the count of pixels kept.
export const renderMagnitudePreview = (
  pre: Precomputed,
  out: ImageData,
  params: DetectorParams,
  mode: "magnitude" | "binary"
): { kept: number; magThresh: number } => {
  const { W, H, Gx, Gy, mag, sortedMag } = pre;
  const tol = Math.tan((params.angleTolDeg * Math.PI) / 180);
  const magThresh = magThresholdAtPercentile(sortedMag, params.magPercentile);
  const eps = 1e-8;
  const N = W * H;
  const od = out.data;

  let kept = 0;
  if (mode === "binary") {
    for (let i = 0; i < N; i++) {
      let v = 0;
      const m = mag[i];
      if (m > magThresh) {
        const ax = Math.abs(Gx[i]);
        const ay = Math.abs(Gy[i]);
        if (ay / (ax + eps) < tol || ax / (ay + eps) < tol) {
          v = 255;
          kept++;
        }
      }
      const o = i * 4;
      od[o] = v;
      od[o + 1] = v;
      od[o + 2] = v;
      od[o + 3] = 255;
    }
  } else {
    let maxKept = 0;
    for (let i = 0; i < N; i++) {
      const m = mag[i];
      if (m <= magThresh) continue;
      const ax = Math.abs(Gx[i]);
      const ay = Math.abs(Gy[i]);
      if (ay / (ax + eps) < tol || ax / (ay + eps) < tol) {
        if (m > maxKept) maxKept = m;
        kept++;
      }
    }
    const inv = maxKept > 0 ? 255 / maxKept : 0;
    for (let i = 0; i < N; i++) {
      let v = 0;
      const m = mag[i];
      if (m > magThresh) {
        const ax = Math.abs(Gx[i]);
        const ay = Math.abs(Gy[i]);
        if (ay / (ax + eps) < tol || ax / (ay + eps) < tol) {
          v = Math.round(m * inv);
          if (v > 255) v = 255;
        }
      }
      const o = i * 4;
      od[o] = v;
      od[o + 1] = v;
      od[o + 2] = v;
      od[o + 3] = 255;
    }
  }

  return { kept, magThresh };
};

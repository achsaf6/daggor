# /// script
# requires-python = ">=3.9"
# dependencies = []
# ///
"""Build a self-contained interactive Sobel HTML viewer with the map embedded."""

import base64
from pathlib import Path

HERE = Path(__file__).parent
IMG = HERE / "map.webp"
OUT = HERE / "sobel_explorer.html"

b64 = base64.b64encode(IMG.read_bytes()).decode("ascii")

HTML = """<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Sobel axis-aligned edge explorer</title>
<style>
  :root { color-scheme: dark; }
  body { font-family: -apple-system, system-ui, sans-serif; margin: 20px; background: #111; color: #eee; }
  h2 { margin: 0 0 12px; font-weight: 500; }
  .controls { display: flex; gap: 28px; margin-bottom: 12px; flex-wrap: wrap; align-items: flex-end; }
  .control { display: flex; flex-direction: column; min-width: 320px; }
  label { font-size: 13px; margin-bottom: 4px; color: #bbb; }
  .value { font-variant-numeric: tabular-nums; color: #9cf; font-weight: 600; }
  input[type=range] { width: 100%; }
  .mode { margin-bottom: 12px; font-size: 13px; color: #bbb; }
  .mode label { display: inline-block; margin-right: 16px; cursor: pointer; }
  canvas { max-width: 100%; height: auto; border: 1px solid #333; image-rendering: pixelated; }
  .status { font-size: 12px; color: #888; margin-top: 6px; font-variant-numeric: tabular-nums; }
  details { margin-top: 10px; font-size: 12px; color: #888; }
</style>
</head>
<body>
<h2>Sobel &mdash; axis-aligned edge explorer</h2>
<div class="controls">
  <div class="control">
    <label>Angle tolerance: <span class="value" id="angVal">5.0</span>&deg; from vertical/horizontal</label>
    <input type="range" id="ang" min="0" max="45" step="0.5" value="5">
  </div>
  <div class="control">
    <label>Magnitude threshold: <span class="value" id="magVal">90</span>th percentile (keep top <span id="magKept">10</span>%)</label>
    <input type="range" id="mag" min="0" max="100" step="1" value="90">
  </div>
  <div class="control grid-only" style="display:none">
    <label>Peak strength: <span class="value" id="peakVal">85</span>th percentile of projection sums</label>
    <input type="range" id="peak" min="50" max="99.5" step="0.5" value="85">
  </div>
  <div class="control grid-only" style="display:none">
    <label>Min line spacing: <span class="value" id="sepVal">25</span> px</label>
    <input type="range" id="sep" min="2" max="200" step="1" value="25">
  </div>
</div>
<div class="mode">
  <label><input type="radio" name="mode" value="magnitude" checked> Filtered magnitude (brightness = edge strength)</label>
  <label><input type="radio" name="mode" value="binary"> Binary (white where axis-aligned &amp; above threshold)</label>
  <label><input type="radio" name="mode" value="grid"> Detected grid (overlay on dimmed source)</label>
</div>
<canvas id="out"></canvas>
<div class="status" id="status">loading&hellip;</div>
<details>
  <summary>How the filter works</summary>
  <p>Sobel computes gradient components <code>Gx</code> (horizontal change) and <code>Gy</code> (vertical change) at every pixel. A pixel is kept when (a) its magnitude <code>&radic;(Gx&sup2; + Gy&sup2;)</code> is above the percentile threshold, AND (b) the gradient is axis-aligned &mdash; i.e. <code>|Gy|/|Gx|</code> below <code>tan(tol)</code> for vertical edges, or <code>|Gx|/|Gy|</code> below <code>tan(tol)</code> for horizontal edges.</p>
</details>

<img id="src" src="data:image/webp;base64,__B64__" style="display:none" crossorigin="anonymous">

<script>
const img = document.getElementById('src');
const canvas = document.getElementById('out');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');

let W = 0, H = 0;
let Gx, Gy, mag, sortedMag;
let outImageData;
let srcImageData;  // original RGBA, for grid-overlay mode

function precompute() {
  const t0 = performance.now();
  W = img.naturalWidth;
  H = img.naturalHeight;
  canvas.width = W;
  canvas.height = H;

  const tmp = document.createElement('canvas');
  tmp.width = W; tmp.height = H;
  const tctx = tmp.getContext('2d');
  tctx.drawImage(img, 0, 0);
  srcImageData = tctx.getImageData(0, 0, W, H);
  const data = srcImageData.data;

  const N = W * H;
  const gray = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    gray[i] = 0.299 * data[i*4] + 0.587 * data[i*4+1] + 0.114 * data[i*4+2];
  }

  Gx = new Float32Array(N);
  Gy = new Float32Array(N);
  mag = new Float32Array(N);

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const tl = gray[i - W - 1], tc = gray[i - W], tr = gray[i - W + 1];
      const ml = gray[i - 1],                       mr = gray[i + 1];
      const bl = gray[i + W - 1], bc = gray[i + W], br = gray[i + W + 1];
      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      Gx[i] = gx;
      Gy[i] = gy;
      mag[i] = Math.hypot(gx, gy);
    }
  }

  sortedMag = new Float32Array(mag);
  sortedMag.sort();

  outImageData = ctx.createImageData(W, H);
  for (let i = 0; i < N; i++) outImageData.data[i*4 + 3] = 255;

  status.textContent = `precomputed Sobel in ${(performance.now() - t0).toFixed(0)} ms (${W}×${H})`;
  render();
}

function fitRegularGrid(peaks, profileLength) {
  if (peaks.length < 2) return null;
  const p = [...peaks].sort((a, b) => a - b);
  // initial pitch = median of consecutive differences
  const diffs = [];
  for (let i = 1; i < p.length; i++) diffs.push(p[i] - p[i - 1]);
  diffs.sort((a, b) => a - b);
  let s = diffs[Math.floor(diffs.length / 2)];
  if (!(s > 0)) return null;
  let o = ((p[0] % s) + s) % s;
  // iterative refinement: assign each peak to nearest grid index k, then linear-regress
  for (let it = 0; it < 12; it++) {
    let sumK = 0, sumP = 0, sumKK = 0, sumKP = 0;
    const n = p.length;
    for (let i = 0; i < n; i++) {
      const k = Math.round((p[i] - o) / s);
      sumK += k; sumP += p[i]; sumKK += k * k; sumKP += k * p[i];
    }
    const denom = n * sumKK - sumK * sumK;
    if (denom === 0) break;
    const newS = (n * sumKP - sumK * sumP) / denom;
    const newO = (sumP - newS * sumK) / n;
    if (!isFinite(newS) || newS <= 0) break;
    const dS = Math.abs(newS - s), dO = Math.abs(newO - o);
    s = newS; o = newO;
    if (dS < 0.005 && dO < 0.005) break;
  }
  // generate grid positions covering [0, profileLength)
  const lines = [];
  const kStart = Math.ceil(-o / s);
  const kEnd = Math.floor((profileLength - 1 - o) / s);
  for (let k = kStart; k <= kEnd; k++) lines.push(o + k * s);
  // RMS residual of input peaks against fitted grid
  let sse = 0;
  for (const pi of p) {
    const k = Math.round((pi - o) / s);
    const d = pi - (o + k * s);
    sse += d * d;
  }
  const rms = Math.sqrt(sse / p.length);
  return { pitch: s, offset: o, lines, rms };
}

function detectPeaks(profile, peakPercentile, minSep) {
  // height threshold = percentile of non-zero values (zeros dominate otherwise)
  const nonzero = [];
  for (let i = 0; i < profile.length; i++) if (profile[i] > 0) nonzero.push(profile[i]);
  let heightThresh = 0;
  if (nonzero.length) {
    nonzero.sort((a, b) => a - b);
    const idx = Math.floor((peakPercentile / 100) * (nonzero.length - 1));
    heightThresh = nonzero[idx];
  }
  // 1D non-max suppression: sort candidate indices by height desc, accept if no taller peak within minSep
  const cands = [];
  for (let i = 0; i < profile.length; i++) if (profile[i] >= heightThresh && profile[i] > 0) cands.push(i);
  cands.sort((a, b) => profile[b] - profile[a]);
  const peaks = [];
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
}

function render() {
  const t0 = performance.now();
  const tolDeg = parseFloat(document.getElementById('ang').value);
  const percentile = parseFloat(document.getElementById('mag').value);
  document.getElementById('angVal').textContent = tolDeg.toFixed(1);
  document.getElementById('magVal').textContent = percentile.toFixed(0);
  document.getElementById('magKept').textContent = (100 - percentile).toFixed(0);
  const mode = document.querySelector('input[name=mode]:checked').value;

  // toggle grid-only sliders
  const gridOnly = document.querySelectorAll('.grid-only');
  gridOnly.forEach(el => el.style.display = (mode === 'grid') ? '' : 'none');

  const tol = Math.tan(tolDeg * Math.PI / 180);
  const N = W * H;
  let idx = Math.floor((percentile / 100) * (N - 1));
  if (idx >= N) idx = N - 1;
  const magThresh = sortedMag[idx];
  const eps = 1e-8;

  if (mode === 'grid') {
    const peakPercentile = parseFloat(document.getElementById('peak').value);
    const minSep = parseInt(document.getElementById('sep').value, 10);
    document.getElementById('peakVal').textContent = peakPercentile.toFixed(1);
    document.getElementById('sepVal').textContent = minSep;

    // build column projection (vertical-edge pixels) and row projection (horizontal-edge pixels)
    const colSum = new Float32Array(W);
    const rowSum = new Float32Array(H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const m = mag[i];
        if (m <= magThresh) continue;
        const ax = Math.abs(Gx[i]);
        const ay = Math.abs(Gy[i]);
        if (ay / (ax + eps) < tol) colSum[x] += 1;       // vertical-edge gradient
        else if (ax / (ay + eps) < tol) rowSum[y] += 1;  // horizontal-edge gradient
      }
    }

    const v = detectPeaks(colSum, peakPercentile, minSep);
    const h = detectPeaks(rowSum, peakPercentile, minSep);
    const fitV = fitRegularGrid(v.peaks, W);
    const fitH = fitRegularGrid(h.peaks, H);

    // background: dimmed source
    ctx.putImageData(srcImageData, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    // overlay: fitted regular grid in red; original raw peaks dimmed in yellow for comparison
    ctx.strokeStyle = 'rgba(255,220,0,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const x of v.peaks) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
    for (const y of h.peaks) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,64,64,0.95)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (fitV) for (const x of fitV.lines) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
    if (fitH) for (const y of fitH.lines) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    ctx.stroke();

    const pV = fitV ? `pitch_x=${fitV.pitch.toFixed(2)}px, offset=${fitV.offset.toFixed(2)}, rms=${fitV.rms.toFixed(2)} (${fitV.lines.length} lines)` : 'pitch_x: insufficient peaks';
    const pH = fitH ? `pitch_y=${fitH.pitch.toFixed(2)}px, offset=${fitH.offset.toFixed(2)}, rms=${fitH.rms.toFixed(2)} (${fitH.lines.length} lines)` : 'pitch_y: insufficient peaks';
    status.textContent = `${pV} | ${pH} | from ${v.peaks.length}+${h.peaks.length} raw peaks (yellow) → fitted grid (red) | ${(performance.now() - t0).toFixed(0)} ms`;
    return;
  }

  let kept = 0;
  let maxKept = 0;
  if (mode === 'magnitude') {
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
  }

  const od = outImageData.data;
  if (mode === 'binary') {
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
      od[o] = v; od[o+1] = v; od[o+2] = v;
    }
  } else {
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
      od[o] = v; od[o+1] = v; od[o+2] = v;
    }
  }
  ctx.putImageData(outImageData, 0, 0);

  const pct = (100 * kept / N).toFixed(2);
  status.textContent = `mag threshold = ${magThresh.toFixed(1)}  |  kept ${kept.toLocaleString()} px (${pct}%)  |  render ${(performance.now() - t0).toFixed(0)} ms`;
}

document.getElementById('ang').addEventListener('input', render);
document.getElementById('mag').addEventListener('input', render);
document.getElementById('peak').addEventListener('input', render);
document.getElementById('sep').addEventListener('input', render);
document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', render));

if (img.complete && img.naturalWidth) precompute();
else img.addEventListener('load', precompute);
</script>
</body>
</html>
"""

OUT.write_text(HTML.replace("__B64__", b64))
print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.1f} KB)")

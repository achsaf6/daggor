"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useBattlemap } from "../../../providers/BattlemapProvider";
import { DEFAULT_BATTLEMAP_MAP_PATH } from "../../../../lib/defaultBattlemap";
import {
  DetectorMode,
  DetectorParams,
  Precomputed,
  precompute,
  renderMagnitudePreview,
  runDetection,
} from "../../../utils/gridDetect";

interface GridDetectorModalProps {
  open: boolean;
  onClose: () => void;
}

const DEFAULT_PARAMS: DetectorParams = {
  angleTolDeg: 5,
  magPercentile: 90,
  peakPercentile: 85,
  minLineSpacing: 25,
};

const SliderRow = ({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
  display: string;
}) => {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <label className="flex items-center justify-between text-xs mb-2">
        <span className="glass-numeric" style={{ color: "var(--glass-txt-muted)" }}>
          {label}
        </span>
        <span className="glass-numeric" style={{ color: "var(--glass-accent-deep)" }}>
          {display}
        </span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, var(--glass-accent) 0%, var(--glass-accent) ${pct}%, var(--glass-border) ${pct}%, var(--glass-border) 100%)`,
          accentColor: "var(--glass-accent)",
        }}
      />
    </div>
  );
};

export const GridDetectorModal = ({ open, onClose }: GridDetectorModalProps) => {
  const { currentBattlemap, applyDetectedGrid } = useBattlemap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const srcImageDataRef = useRef<ImageData | null>(null);
  const preRef = useRef<Precomputed | null>(null);

  const [mode, setMode] = useState<DetectorMode>("grid");
  const [params, setParams] = useState<DetectorParams>(DEFAULT_PARAMS);
  const [showFitted, setShowFitted] = useState(true);
  const [showRawPeaks, setShowRawPeaks] = useState(true);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [status, setStatus] = useState<string>("");
  const [isApplying, setIsApplying] = useState(false);

  const mapSrc = useMemo(() => {
    if (!currentBattlemap) return null;
    const activeImage = currentBattlemap.images.find(
      (img) => img.id === currentBattlemap.activeImageId
    );
    const path = activeImage?.mapPath || currentBattlemap.mapPath || DEFAULT_BATTLEMAP_MAP_PATH;
    return path && path.trim().length > 0 ? path : DEFAULT_BATTLEMAP_MAP_PATH;
  }, [currentBattlemap]);

  // Load image + run precompute on open.
  useEffect(() => {
    if (!open || !mapSrc) return;

    let cancelled = false;
    setLoadState("loading");
    setStatus("Loading map…");
    preRef.current = null;
    srcImageDataRef.current = null;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      const tmp = document.createElement("canvas");
      tmp.width = W;
      tmp.height = H;
      const tctx = tmp.getContext("2d");
      if (!tctx) {
        setLoadState("error");
        setStatus("Couldn't create canvas context");
        return;
      }
      tctx.drawImage(img, 0, 0);
      let imageData: ImageData;
      try {
        imageData = tctx.getImageData(0, 0, W, H);
      } catch {
        setLoadState("error");
        setStatus("Couldn't read pixels from this map (CORS)");
        return;
      }
      srcImageDataRef.current = imageData;
      const t0 = performance.now();
      preRef.current = precompute(imageData);
      const elapsed = performance.now() - t0;
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = W;
        canvas.height = H;
      }
      setLoadState("ready");
      setStatus(`Precomputed Sobel in ${elapsed.toFixed(0)}ms (${W}×${H})`);
    };
    img.onerror = () => {
      if (cancelled) return;
      setLoadState("error");
      setStatus("Failed to load map image");
    };
    img.src = mapSrc;

    return () => {
      cancelled = true;
    };
  }, [open, mapSrc]);

  // Render canvas on every param/mode change after precompute is done.
  useEffect(() => {
    if (loadState !== "ready") return;
    const canvas = canvasRef.current;
    const pre = preRef.current;
    const srcImageData = srcImageDataRef.current;
    if (!canvas || !pre || !srcImageData) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const t0 = performance.now();
    const { W, H } = pre;

    if (mode === "grid") {
      const result = runDetection(pre, params);
      ctx.putImageData(srcImageData, 0, 0);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, W, H);

      // Raw peaks (yellow, low alpha)
      if (showRawPeaks) {
        ctx.strokeStyle = "rgba(255,220,0,0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        const rawV = result.fitV?.rawPeaks ?? [];
        const rawH = result.fitH?.rawPeaks ?? [];
        for (const x of rawV) {
          ctx.moveTo(x + 0.5, 0);
          ctx.lineTo(x + 0.5, H);
        }
        for (const y of rawH) {
          ctx.moveTo(0, y + 0.5);
          ctx.lineTo(W, y + 0.5);
        }
        ctx.stroke();
      }

      // Fitted grid (red)
      if (showFitted) {
        ctx.strokeStyle = "rgba(255,64,64,0.95)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (result.fitV) {
          for (const x of result.fitV.lines) {
            ctx.moveTo(x + 0.5, 0);
            ctx.lineTo(x + 0.5, H);
          }
        }
        if (result.fitH) {
          for (const y of result.fitH.lines) {
            ctx.moveTo(0, y + 0.5);
            ctx.lineTo(W, y + 0.5);
          }
        }
        ctx.stroke();
      }

      const elapsed = performance.now() - t0;
      const pV = result.fitV
        ? `pitch_x=${result.fitV.pitch.toFixed(2)}px, rms=${result.fitV.rms.toFixed(2)} (${result.fitV.lines.length} lines)`
        : "pitch_x: insufficient peaks";
      const pH = result.fitH
        ? `pitch_y=${result.fitH.pitch.toFixed(2)}px, rms=${result.fitH.rms.toFixed(2)} (${result.fitH.lines.length} lines)`
        : "pitch_y: insufficient peaks";
      setStatus(`${pV} | ${pH} | ${elapsed.toFixed(0)}ms`);
      return;
    }

    // magnitude / binary preview modes
    const out = ctx.createImageData(W, H);
    const { kept } = renderMagnitudePreview(pre, out, params, mode);
    ctx.putImageData(out, 0, 0);
    const elapsed = performance.now() - t0;
    const pct = ((100 * kept) / (W * H)).toFixed(2);
    setStatus(`kept ${kept.toLocaleString()} px (${pct}%) | ${elapsed.toFixed(0)}ms`);
  }, [loadState, mode, params, showFitted, showRawPeaks]);

  const handleApply = useCallback(async () => {
    const pre = preRef.current;
    if (!pre) return;
    const result = runDetection(pre, params);
    if (!result.fitV || !result.fitH || result.fitV.lines.length === 0 || result.fitH.lines.length === 0) {
      setStatus("Cannot apply: insufficient peaks on one or both axes");
      return;
    }
    setIsApplying(true);
    try {
      await applyDetectedGrid({
        verticalLines: result.fitV.lines,
        horizontalLines: result.fitH.lines,
        imageWidth: pre.W,
        imageHeight: pre.H,
      });
      onClose();
    } catch (err) {
      console.error("Failed to apply detected grid", err);
      setStatus("Failed to apply grid");
    } finally {
      setIsApplying(false);
    }
  }, [params, applyDetectedGrid, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="glass-panel flex flex-col max-h-full max-w-[1200px] w-full"
        style={{
          background: "var(--glass-bg, rgba(20,20,24,0.95))",
          border: "1px solid var(--glass-border)",
          borderRadius: 12,
          padding: 16,
          gap: 12,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="glass-heading text-sm">Detect grid</h3>
          <button
            type="button"
            onClick={onClose}
            className="opacity-70 hover:opacity-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className="flex-1 min-h-0 flex items-center justify-center"
          style={{ background: "#111", borderRadius: 8, overflow: "hidden" }}
        >
          {loadState === "error" ? (
            <div className="glass-muted p-6 text-sm" style={{ color: "var(--glass-txt-muted)" }}>
              {status || "Failed to load map"}
            </div>
          ) : loadState !== "ready" ? (
            <div className="glass-muted p-6 text-sm" style={{ color: "var(--glass-txt-muted)" }}>
              {status || "Loading…"}
            </div>
          ) : null}
          <canvas
            ref={canvasRef}
            style={{
              display: loadState === "ready" ? "block" : "none",
              maxWidth: "100%",
              maxHeight: "60vh",
              width: "auto",
              height: "auto",
              imageRendering: "pixelated",
              border: "1px solid #333",
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {(["grid", "magnitude", "binary"] as DetectorMode[]).map((m) => (
            <label
              key={m}
              className="flex items-center gap-1 cursor-pointer px-2 py-1 rounded"
              style={{
                background:
                  mode === m ? "var(--glass-accent-soft, rgba(255,255,255,0.06))" : "transparent",
                border: "1px solid var(--glass-border)",
              }}
            >
              <input
                type="radio"
                name="grid-detector-mode"
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
              />
              <span className="glass-numeric capitalize" style={{ color: "var(--glass-txt-muted)" }}>
                {m}
              </span>
            </label>
          ))}
          {mode === "grid" ? (
            <>
              <label
                className="flex items-center gap-1 cursor-pointer px-2 py-1 rounded ml-2"
                style={{ border: "1px solid var(--glass-border)" }}
                title="Show fitted grid lines"
              >
                <input
                  type="checkbox"
                  checked={showFitted}
                  onChange={(e) => setShowFitted(e.target.checked)}
                />
                <span
                  className="glass-numeric"
                  style={{ color: "rgb(255,80,80)" }}
                >
                  Fitted grid
                </span>
              </label>
              <label
                className="flex items-center gap-1 cursor-pointer px-2 py-1 rounded"
                style={{ border: "1px solid var(--glass-border)" }}
                title="Show raw detected peaks"
              >
                <input
                  type="checkbox"
                  checked={showRawPeaks}
                  onChange={(e) => setShowRawPeaks(e.target.checked)}
                />
                <span
                  className="glass-numeric"
                  style={{ color: "rgb(220,200,0)" }}
                >
                  Raw peaks
                </span>
              </label>
            </>
          ) : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SliderRow
            label="Angle tolerance (° from axis)"
            value={params.angleTolDeg}
            min={0}
            max={45}
            step={0.5}
            onChange={(v) => setParams((p) => ({ ...p, angleTolDeg: v }))}
            display={`${params.angleTolDeg.toFixed(1)}°`}
          />
          <SliderRow
            label="Magnitude percentile (keep top %)"
            value={params.magPercentile}
            min={0}
            max={100}
            step={1}
            onChange={(v) => setParams((p) => ({ ...p, magPercentile: v }))}
            display={`${params.magPercentile.toFixed(0)}th (keep ${(100 - params.magPercentile).toFixed(0)}%)`}
          />
          <SliderRow
            label="Peak strength percentile (grid)"
            value={params.peakPercentile}
            min={50}
            max={99.5}
            step={0.5}
            onChange={(v) => setParams((p) => ({ ...p, peakPercentile: v }))}
            display={`${params.peakPercentile.toFixed(1)}th`}
          />
          <SliderRow
            label="Min line spacing (px)"
            value={params.minLineSpacing}
            min={2}
            max={200}
            step={1}
            onChange={(v) => setParams((p) => ({ ...p, minLineSpacing: v }))}
            display={`${params.minLineSpacing} px`}
          />
        </div>

        <div
          className="glass-muted text-xs"
          style={{ color: "var(--glass-txt-muted)", fontVariantNumeric: "tabular-nums" }}
        >
          {status}
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isApplying}
            className="glass-body px-3 py-2 text-sm border transition-colors disabled:opacity-50 hover:bg-[var(--glass-highlight)]"
            style={{ borderColor: "var(--glass-border)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={loadState !== "ready" || isApplying || mode !== "grid"}
            className="glass-body px-3 py-2 text-sm border transition-colors disabled:opacity-50 hover:bg-[var(--glass-highlight)]"
            style={{
              borderColor: "var(--glass-border)",
              background: "var(--glass-accent-soft, rgba(255,255,255,0.04))",
            }}
            title={mode !== "grid" ? "Switch to 'grid' mode to apply" : undefined}
          >
            {isApplying ? "Applying…" : "Apply grid"}
          </button>
        </div>
      </div>
    </div>
  );
};

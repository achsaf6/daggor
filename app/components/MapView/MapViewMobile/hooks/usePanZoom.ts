import { useState, useRef, useEffect } from "react";
import { PanState } from "../types";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8.0;
const INITIAL_ZOOM = 2.5;

export const usePanZoom = () => {
  const [mobileZoomScale, setMobileZoomScale] = useState(INITIAL_ZOOM);
  const zoomScaleRef = useRef(INITIAL_ZOOM);
  
  const [panState, setPanState] = useState<PanState>({
    translateX: 0,
    translateY: 0,
    isPanning: false,
  });
  
  const [isPinching, setIsPinching] = useState(false);
  const panStateRef = useRef(panState);
  const panStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // Update refs when state changes
  useEffect(() => {
    panStateRef.current = panState;
  }, [panState]);

  useEffect(() => {
    zoomScaleRef.current = mobileZoomScale;
  }, [mobileZoomScale]);

  return {
    mobileZoomScale,
    setMobileZoomScale,
    zoomScaleRef,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    panState,
    setPanState,
    panStateRef,
    panStartPosRef,
    isPinching,
    setIsPinching,
  };
};


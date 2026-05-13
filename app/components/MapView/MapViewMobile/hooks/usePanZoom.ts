import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { PanState } from "../types";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8.0;
const INITIAL_ZOOM = 2.5;

const INITIAL_PAN: PanState = { translateX: 0, translateY: 0, isPanning: false };

// Refs must update synchronously with state. The previous version mirrored
// state into refs via a separate `useEffect`, which fires AFTER React commits
// — so a Hammer gesture handler that called the setter and then immediately
// read the ref (e.g. successive pinch deltas) would briefly see the old
// value. We wrap the setters so the ref is updated in the same call.
function makeMirroredSetter<T>(
  setState: Dispatch<SetStateAction<T>>,
  ref: React.MutableRefObject<T>
): Dispatch<SetStateAction<T>> {
  return (updater) => {
    if (typeof updater === "function") {
      setState((prev) => {
        const next = (updater as (prev: T) => T)(prev);
        ref.current = next;
        return next;
      });
    } else {
      ref.current = updater;
      setState(updater);
    }
  };
}

export const usePanZoom = () => {
  const [mobileZoomScale, setMobileZoomScaleRaw] = useState(INITIAL_ZOOM);
  const zoomScaleRef = useRef(INITIAL_ZOOM);

  const [panState, setPanStateRaw] = useState<PanState>(INITIAL_PAN);
  const panStateRef = useRef<PanState>(INITIAL_PAN);

  const [isPinching, setIsPinching] = useState(false);
  const panStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // useCallback-stable wrappers, so consumers that put these setters in
  // useEffect dep arrays don't refire on every render of usePanZoom.
  const setMobileZoomScale = useCallback<Dispatch<SetStateAction<number>>>(
    makeMirroredSetter(setMobileZoomScaleRaw, zoomScaleRef),
    []
  );
  const setPanState = useCallback<Dispatch<SetStateAction<PanState>>>(
    makeMirroredSetter(setPanStateRaw, panStateRef),
    []
  );

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


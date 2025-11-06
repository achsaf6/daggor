import { useState, useEffect, RefObject } from "react";
import { ImageBounds } from "../types";
import { calculateImageBounds } from "../utils/imageBounds";

export const useImageBounds = (containerRef: RefObject<HTMLDivElement | null>) => {
  const [imageBounds, setImageBounds] = useState<ImageBounds | null>(null);

  const updateBounds = () => {
    if (!containerRef.current) return;
    const bounds = calculateImageBounds(containerRef.current);
    if (bounds) {
      setImageBounds(bounds);
    }
  };

  useEffect(() => {
    // Calculate image bounds on mount and resize
    // Use a small delay to ensure image is rendered
    const timeoutId = setTimeout(updateBounds, 100);

    const handleResize = () => {
      updateBounds();
    };

    window.addEventListener("resize", handleResize);

    // Also recalculate after image loads
    const img = containerRef.current?.querySelector("img");
    if (img) {
      if (img.complete) {
        updateBounds();
      } else {
        img.addEventListener("load", updateBounds);
      }
    }

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", handleResize);
      if (img) {
        img.removeEventListener("load", updateBounds);
      }
    };
  }, []);

  return { imageBounds, updateBounds };
};


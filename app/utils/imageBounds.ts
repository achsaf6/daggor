import { ImageBounds } from "../types";

/**
 * Calculate image bounds based on object-contain CSS behavior
 */
export const calculateImageBounds = (
  container: HTMLDivElement
): ImageBounds | null => {
  // Find the actual img element rendered by Next.js Image
  const img = container.querySelector("img") as HTMLImageElement;
  if (!img) return null;

  const containerRect = container.getBoundingClientRect();
  const containerAspect = containerRect.width / containerRect.height;

  // Get natural image dimensions
  const naturalWidth = img.naturalWidth || img.width;
  const naturalHeight = img.naturalHeight || img.height;

  // If image hasn't loaded yet, return null
  if (naturalWidth === 0 || naturalHeight === 0) return null;

  const imageAspect = naturalWidth / naturalHeight;

  let renderedWidth: number;
  let renderedHeight: number;
  let left: number;
  let top: number;

  if (containerAspect > imageAspect) {
    // Container is wider - image height fills container
    renderedHeight = containerRect.height;
    renderedWidth = renderedHeight * imageAspect;
    left = (containerRect.width - renderedWidth) / 2;
    top = 0;
  } else {
    // Container is taller - image width fills container
    renderedWidth = containerRect.width;
    renderedHeight = renderedWidth / imageAspect;
    left = 0;
    top = (containerRect.height - renderedHeight) / 2;
  }

  return {
    left: containerRect.left + left,
    top: containerRect.top + top,
    width: renderedWidth,
    height: renderedHeight,
    containerLeft: containerRect.left,
    containerTop: containerRect.top,
    containerWidth: containerRect.width,
    containerHeight: containerRect.height,
  };
};


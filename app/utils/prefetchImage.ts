// Robust image prefetcher used by the dashboard to warm the browser HTTP
// cache for monster token art and battlemap mapPaths *before* the DM opens
// the picker / switches maps.
//
// Why not `new Image()`?
//   - Some browsers deprioritize off-DOM Image() requests behind every other
//     network task, so the prefetch frequently doesn't finish before the
//     real <img> renders.
//   - Some browsers can GC the Image object before the response lands, so
//     the request gets cancelled.
//   - The CORS / cache-key story is fuzzier than the link-based approach.
//
// `<link rel="preload" as="image" href=...>` is what the browser is actually
// designed for. The cache entry persists regardless of JS lifecycle, and
// the response is shared with later <img src=...> renders so they hit cache.

const seen = new Set<string>();

export const prefetchImage = (url: string | null | undefined): void => {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!url) return;
  if (seen.has(url)) return;
  seen.add(url);

  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.href = url;
  // Don't set crossOrigin — must match the eventual <img> tag's behavior
  // (Next.js <Image unoptimized> renders without crossOrigin), otherwise
  // the cache key differs and the preload doesn't help.
  link.addEventListener("error", () => {
    // Drop from dedupe so a later retry (e.g. user re-uploads the asset)
    // can re-attempt the preload.
    seen.delete(url);
  });
  document.head.appendChild(link);
};

// Force a refresh of the prefetch state — used by tests or when the user
// rotates assets in Supabase. Production code should not need this.
export const resetPrefetchCache = (): void => {
  seen.clear();
};

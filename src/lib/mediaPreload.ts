const imageRequestCache = new Set<string>();
const imagePaintCache = new Set<string>();

function isImageLike(url: string) {
  return !/\.(mp4|m4v|mov|webm|ogg|ogv|mkv)(\?|#|$)/i.test(url);
}

export function preloadImage(url: string | null | undefined) {
  if (!url || imageRequestCache.has(url) || !isImageLike(url)) return;
  imageRequestCache.add(url);
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    imagePaintCache.add(url);
  };
  img.src = url;
  if (typeof img.decode === "function") {
    void img
      .decode()
      .then(() => {
        imagePaintCache.add(url);
      })
      .catch(() => {
        // Decode can reject if the browser evicts or defers the image.
        // The normal <img> path still handles loading later.
      });
  }
}

export function hasPreloadedImage(url: string | null | undefined) {
  return !!url && imagePaintCache.has(url);
}

export function markImagePreloaded(url: string | null | undefined) {
  if (!url || !isImageLike(url)) return;
  imageRequestCache.add(url);
  imagePaintCache.add(url);
}

export function preloadImages(
  urls: readonly (string | null | undefined)[],
  limit = 3
) {
  let count = 0;
  for (const url of urls) {
    if (!url) continue;
    preloadImage(url);
    count += 1;
    if (count >= limit) break;
  }
}

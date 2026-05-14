const imageDecodeCache = new Set<string>();

function isImageLike(url: string) {
  return !/\.(mp4|m4v|mov|webm|ogg|ogv|mkv)(\?|#|$)/i.test(url);
}

export function preloadImage(url: string | null | undefined) {
  if (!url || imageDecodeCache.has(url) || !isImageLike(url)) return;
  imageDecodeCache.add(url);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  if (typeof img.decode === "function") {
    void img.decode().catch(() => {
      // Decode can reject if the browser evicts or defers the image.
      // The normal <img> path still handles loading later.
    });
  }
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

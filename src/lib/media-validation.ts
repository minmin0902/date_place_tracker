// Pre-upload validation shared by every media-picking surface
// (PhotoUploader form, MemoThread comment composer, etc.). Keeping
// the limits + duration probe in one place so a future cap change
// only needs editing here.

export const MAX_VIDEO_SECONDS = 60;
export const MAX_VIDEO_MB = 200;
export const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;

// Read video metadata client-side to check duration. Returns null on
// browsers that can't decode (e.g. HEVC on Chrome desktop) so the
// caller can let the upload through rather than soft-blocking valid
// clips.
export async function videoDurationOf(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const dur = Number.isFinite(video.duration) ? video.duration : null;
      URL.revokeObjectURL(url);
      resolve(dur);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    video.src = url;
  });
}

// Throws a user-readable error if the file fails any cap. Caller
// catches and surfaces it in their own error UI.
export async function assertVideoUnderLimit(file: File): Promise<void> {
  if (!file.type.startsWith("video/")) return;
  if (file.size > MAX_VIDEO_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(0);
    throw new Error(
      `동영상이 ${mb}MB라서 못 올려요. ${MAX_VIDEO_MB}MB 이내로 줄여주세요 · 视频${mb}MB太大了，请压缩到${MAX_VIDEO_MB}MB以内`
    );
  }
  const dur = await videoDurationOf(file);
  if (dur != null && dur > MAX_VIDEO_SECONDS + 0.5) {
    throw new Error(
      `동영상은 ${MAX_VIDEO_SECONDS}초 이내만 올릴 수 있어요 · 视频最长${MAX_VIDEO_SECONDS}秒`
    );
  }
}

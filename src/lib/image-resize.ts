// Client-side downscale for profile pictures. Browser-only — it needs a canvas.
//
// An avatar is drawn at 24–72 px and was being shipped at whatever the phone
// produced, up to the 1 MB cap. A people search renders twenty of them, so the
// first visit to /discover paid twenty full-size photos to fill twenty thumbnails.
// Re-encoding at AVATAR_EDGE_PX typically turns a 2–4 MB camera photo into 30–80
// KB, which is the difference between a list that loads and one that crawls.
//
// This is a courtesy, not a guard: it is skippable by posting to /api/avatar
// directly, and it does not run if the browser refuses. The server re-checks the
// size and strips metadata regardless (lib/image-metadata.ts). Discarding EXIF
// is a *side effect* here — a canvas re-encode carries no metadata across — and
// it is deliberately not the thing relied upon for that.

// 2x the largest place an avatar is rendered (72 px in the profile header), so it
// stays sharp on a retina display and nowhere near sharp enough to be worth
// treating as the original photo.
const AVATAR_EDGE_PX = 256;
const QUALITY = 0.85;

/** Formats worth re-encoding. GIF is excluded: it may be animated, and a canvas
 *  pass would silently flatten it to a single frame. */
const RESIZABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode failed"));
    };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

/**
 * Returns a downscaled, re-encoded copy of `file`, or the original file when the
 * format is not resizable, the browser cannot do it, or the result would not
 * actually be smaller.
 *
 * Never throws — every failure path returns the input, because a profile picture
 * that uploads at full size is a far better outcome than one that refuses to
 * upload because a canvas was unavailable.
 */
export async function downscaleAvatar(file: File): Promise<File> {
  if (!RESIZABLE.has(file.type)) return file;
  if (typeof document === "undefined") return file;

  try {
    const img = await loadImage(file);
    const { naturalWidth: w, naturalHeight: h } = img;
    if (!w || !h) return file;

    // Only ever shrink. Scaling a small avatar UP would add bytes and no detail.
    const scale = Math.min(1, AVATAR_EDGE_PX / Math.max(w, h));
    const targetW = Math.max(1, Math.round(w * scale));
    const targetH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // PNG is re-encoded as JPEG: a photographic avatar saved as PNG is the worst
    // case for size, and at 256 px there is no transparency worth keeping in a
    // picture of a person. WebP stays WebP where the browser supports writing it.
    const outType = file.type === "image/webp" ? "image/webp" : "image/jpeg";
    const blob = await toBlob(canvas, outType);
    if (!blob || blob.size === 0) return file;

    // A re-encode that came out larger means the original was already better
    // compressed than anything achieved here — keep it. (The original still gets
    // its metadata stripped server-side.)
    if (blob.size >= file.size) return file;

    const ext = outType === "image/webp" ? "webp" : "jpg";
    const base = file.name.replace(/\.[^.]+$/, "") || "avatar";
    return new File([blob], `${base}.${ext}`, { type: outType });
  } catch {
    return file;
  }
}

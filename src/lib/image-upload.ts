/**
 * Card-image upload allowlist. Deliberately explicit rather than a loose
 * "image/*" check: SVG is excluded on purpose (it can embed <script>/event
 * handlers and isn't sanitized before being rendered back on the public
 * guest page -- a real stored-XSS path), and everything else here is a
 * format every major browser can decode natively in an <img> tag, so a
 * stored card is guaranteed to actually render for guests.
 */
export const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

/**
 * HEIC/HEIF (the default iPhone camera format) isn't decodable by most
 * browsers at all -- storing the raw bytes would silently produce a broken
 * <img> for every guest. Detected separately from ACCEPTED_IMAGE_TYPES
 * because it's handled by converting to JPEG client-side (see
 * convertHeicToJpeg below) rather than accepted as-is. Browsers are
 * inconsistent about the MIME type they report for HEIC files (often a
 * blank string), so this also checks the file extension.
 */
const HEIC_MIME_TYPES = ["image/heic", "image/heif"];
const HEIC_EXTENSIONS = [".heic", ".heif"];

export function isHeicFile(file: File): boolean {
  if (HEIC_MIME_TYPES.includes(file.type.toLowerCase())) return true;
  const name = file.name.toLowerCase();
  return HEIC_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function isAcceptedImageType(file: File): boolean {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type.toLowerCase());
}

/**
 * Server-side re-check against the same allowlist, since card_image_url
 * ultimately arrives at the API as a plain string in a JSON body -- a direct
 * API call (bypassing the upload form entirely) could otherwise submit any
 * MIME type, including SVG, regardless of what the client-side picker
 * enforces. Only inspects the data URL's own declared "data:<mime>;base64,"
 * prefix; this is a type-allowlist, not a guarantee the bytes that follow
 * are actually well-formed image data of that type.
 */
export function isAcceptedImageDataUrl(dataUrl: string): boolean {
  const match = /^data:([^;]+);base64,/i.exec(dataUrl);
  if (!match) return false;
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(match[1].toLowerCase());
}

/**
 * The hard ceiling for any single stored image, enforced on the *encoded*
 * image rather than on the file the sender picked: an oversized photo gets
 * compressed down to fit instead of being rejected. Base64 inflates bytes by
 * ~4/3, so the data URL string is checked against that inflated bound rather
 * than re-decoding it just to measure.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_DATA_URL_LENGTH = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 100;

export function isAcceptedImageDataUrlSize(dataUrl: string): boolean {
  return dataUrl.length <= MAX_IMAGE_DATA_URL_LENGTH;
}

/** Converts a HEIC/HEIF file to a JPEG File client-side via heic2any (no native browser API decodes HEIC). */
export async function convertHeicToJpeg(file: File): Promise<File> {
  const heic2any = (await import("heic2any")).default;
  const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  const jpegBlob = Array.isArray(result) ? result[0] : result;
  const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([jpegBlob], newName, { type: "image/jpeg" });
}

/**
 * Longest edge a photo is scaled down to before it goes onto a design
 * canvas. The card itself is 1000x1250 logical pixels, so anything past this
 * is detail nobody can see.
 */
const CANVAS_IMAGE_MAX_EDGE = 1600;
/** A bring-your-own card is the whole invitation, so it keeps more detail. */
const CARD_IMAGE_MAX_EDGE = 2400;

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Couldn't read that image — it may be corrupted or an unsupported format."));
    el.src = src;
  });
}

/**
 * Draws `img` at `scale` and encodes it. WebP is preferred because it keeps
 * transparency (JPEG would flatten a cut-out PNG onto black) at a fraction of
 * PNG's size; browsers that refuse WebP from a canvas fall back to JPEG.
 */
function encodeAt(img: HTMLImageElement, scale: number, quality: number): string {
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process that image.");
  ctx.drawImage(img, 0, 0, width, height);
  const webp = canvas.toDataURL("image/webp", quality);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", quality);
}

/**
 * Compresses any accepted image down to a data URL that fits within
 * MAX_IMAGE_BYTES, instead of refusing anything over that size.
 *
 * Two reasons this has to happen client-side rather than just being a limit:
 * a modern phone photo is routinely well past 5MB, and Fabric embeds image
 * data inline in the serialized canvas -- so a raw upload would push a whole
 * design past its stored-size cap, at which point the server's
 * clamp-don't-reject sanitizer replaced the canvas with an empty one and the
 * sender's work vanished on the next reload.
 *
 * Strategy: cap the longest edge first (the single biggest win), then step
 * quality down, then halve the dimensions if a pathological image still
 * won't fit. Gives up only if even a tiny thumbnail can't be encoded.
 */
async function compressToDataUrl(file: File, maxEdge: number): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objectUrl);

    const longestEdge = Math.max(img.naturalWidth, img.naturalHeight);
    let scale = longestEdge > maxEdge ? maxEdge / longestEdge : 1;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      for (const quality of [0.85, 0.7, 0.55, 0.4]) {
        const dataUrl = encodeAt(img, scale, quality);
        if (dataUrl.length <= MAX_IMAGE_DATA_URL_LENGTH) return dataUrl;
      }
      // Still too big even at low quality -- the image is enormous rather
      // than merely detailed, so shrink the pixel dimensions and retry.
      scale *= 0.75;
    }

    throw new Error("Couldn't compress that image small enough — please try a different one.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Prepares an image to be placed as an object on a design canvas. */
export function prepareImageForCanvas(file: File): Promise<string> {
  return compressToDataUrl(file, CANVAS_IMAGE_MAX_EDGE);
}

/** Prepares a bring-your-own-card image, which is the whole invitation. */
export function prepareCardImage(file: File): Promise<string> {
  return compressToDataUrl(file, CARD_IMAGE_MAX_EDGE);
}

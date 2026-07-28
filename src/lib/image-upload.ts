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
 * The upload forms (BringYourOwnCardForm, EventEditor) already cap file
 * size client-side at 5MB before ever base64-encoding it, but that's a UX
 * nicety only -- a direct API call bypasses the picker entirely and could
 * otherwise submit an arbitrarily large data URL straight into a JSONB
 * column with no size check at all. This is the actual server-side
 * enforcement point. Base64 inflates the original byte size by ~4/3, so the
 * data URL string itself is checked against that inflated bound rather than
 * re-decoding it just to measure.
 */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_DATA_URL_LENGTH = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 100;

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

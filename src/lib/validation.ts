/**
 * Shared input bounds for anything that reaches the database from a request
 * body. Every one of these fields used to be unbounded -- a direct API call
 * (bypassing the browser forms, which have their own maxlengths) could send
 * a multi-megabyte "name" or "guest name" straight into a TEXT column, so
 * these are the actual enforcement point, not the inputs.
 */

export const MAX_USERNAME_LENGTH = 64;
export const MAX_PERSON_NAME_LENGTH = 120;
export const MAX_TITLE_LENGTH = 200;
/** Host name, location -- single-line fields. */
export const MAX_SHORT_TEXT_LENGTH = 300;
/** Description / free-text body copy. */
export const MAX_LONG_TEXT_LENGTH = 5000;
export const MAX_URL_LENGTH = 2048;
export const MAX_ANSWER_LENGTH = 2000;
/** Cap on how many guest categories one event can define. */
export const MAX_GUEST_CATEGORIES = 12;
export const MAX_GUEST_CATEGORY_LENGTH = 40;
/** Cap on how many ad hoc RSVP questions one hosted_template event can define. */
export const MAX_QUESTIONS = 20;
export const MAX_QUESTION_LABEL_LENGTH = 200;

/**
 * Trimmed string, truncated to `max`. Truncates rather than rejecting so an
 * over-long value from a legitimate client is still saved (just clipped)
 * instead of failing the whole request -- same clamp-don't-reject posture
 * the design config sanitizer already uses.
 */
export function boundedText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

/** Same as boundedText, but an empty result becomes null (for nullable columns). */
export function optionalBoundedText(value: unknown, max: number): string | null {
  const text = boundedText(value, max);
  return text.length > 0 ? text : null;
}

/**
 * Rejects a request whose declared body is larger than `maxBytes` before it
 * gets parsed into memory. Route handlers otherwise buffer the entire body
 * via req.json() with no upper bound at all, so a single large POST could
 * exhaust process memory regardless of how carefully the parsed fields are
 * validated afterwards. Returns null when the request is acceptable.
 */
export function bodyTooLarge(req: Request, maxBytes: number): boolean {
  const declared = Number(req.headers.get("content-length"));
  return Number.isFinite(declared) && declared > maxBytes;
}

/** Small JSON bodies -- credentials, confirmations, simple field updates. */
export const SMALL_BODY_LIMIT = 64 * 1024;
/** Bodies that legitimately carry a base64 image or a serialized canvas. */
export const MEDIA_BODY_LIMIT = 16 * 1024 * 1024;

import { createHmac, timingSafeEqual } from "crypto";

const SECRET = process.env.SESSION_SECRET || "";
if (Buffer.byteLength(SECRET) < 32) {
  throw new Error("SESSION_SECRET must be configured with at least 32 bytes.");
}

export type SessionPayload =
  | { type: "admin"; sessionId: string; exp: number }
  | { type: "sender"; sessionId: string; userId: string; username: string; exp: number };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sign(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

export function createSessionToken(
  payload:
    | { type: "admin"; sessionId: string }
    | { type: "sender"; sessionId: string; userId: string; username: string },
): string {
  const full: SessionPayload = {
    ...payload,
    exp: Date.now() + SESSION_TOKEN_MAX_AGE * 1000,
  } as SessionPayload;
  const data = Buffer.from(JSON.stringify(full)).toString("base64url");
  const signature = sign(data);
  return `${data}.${signature}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;

  const expectedSignature = sign(data);
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (!isSessionPayload(parsed)) return null;
    if (parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * The signature check above already proves this app minted the token, so
 * this is about shape rather than trust -- a payload from an older token
 * format (or one missing `exp` entirely) would otherwise pass through as a
 * valid session, because `undefined < Date.now()` is false and so reads as
 * "not expired."
 */
function isSessionPayload(value: unknown): value is SessionPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.exp !== "number" || !Number.isFinite(v.exp)) return false;
  if (typeof v.sessionId !== "string" || !UUID_RE.test(v.sessionId)) return false;
  if (v.type === "admin") return true;
  return v.type === "sender" && typeof v.userId === "string" && typeof v.username === "string";
}

/**
 * Admin and sender sessions use separate cookie names so both roles can be
 * logged in independently in the same browser without one login clobbering
 * the other's cookie/remember-me duration.
 */
export const ADMIN_SESSION_COOKIE_NAME = "admin_session";
export const SENDER_SESSION_COOKIE_NAME = "sender_session";

export const SESSION_TOKEN_MAX_AGE = 60 * 60 * 24 * 30; // 30 days — outer safety bound
export const SESSION_COOKIE_MAX_AGE_REMEMBERED = 60 * 60 * 24 * 30; // 30 days
export const SESSION_COOKIE_MAX_AGE_DEFAULT = 60 * 60 * 24; // 1 day — explicit, not a session-only cookie

/**
 * Whether session cookies get the `Secure` flag. Explicit opt-in via
 * FORCE_SECURE_COOKIES rather than tied to NODE_ENV, since NODE_ENV reflects
 * build mode, not actual transport — set FORCE_SECURE_COOKIES=true once this
 * app is actually served over HTTPS.
 */
export const SESSION_COOKIE_SECURE = process.env.FORCE_SECURE_COOKIES === "true";

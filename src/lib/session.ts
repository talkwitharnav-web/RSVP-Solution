import { createHmac, timingSafeEqual } from "crypto";

/**
 * Dev-only fallback secret, same pattern as the reference project's own
 * session.ts, so the app works locally without requiring SESSION_SECRET to
 * be set. Set a real SESSION_SECRET before any non-local deployment.
 */
if (!process.env.SESSION_SECRET) {
  console.warn(
    "\n*** WARNING: SESSION_SECRET is not set. Falling back to a hardcoded, " +
    "publicly-known dev secret — anyone who has seen this source can forge " +
    "admin/sender sessions. Set SESSION_SECRET in .env.local before any " +
    "non-local use. ***\n",
  );
}

const SECRET = process.env.SESSION_SECRET || "dev-only-insecure-session-secret";

export type SessionPayload =
  | { type: "admin"; exp: number }
  | { type: "sender"; userId: string; username: string; exp: number };

function sign(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

export function createSessionToken(
  payload: { type: "admin" } | { type: "sender"; userId: string; username: string },
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
    const payload: SessionPayload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
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

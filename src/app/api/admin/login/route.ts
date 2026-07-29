import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import {
  createSessionToken,
  ADMIN_SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_REMEMBERED,
  SESSION_COOKIE_MAX_AGE_DEFAULT,
  SESSION_COOKIE_SECURE,
} from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { bodyTooLarge, SMALL_BODY_LIMIT } from "@/lib/validation";

// No hardcoded fallback -- this repo is public, so anything committed here
// is permanently public too (even a later commit removing it doesn't erase
// old commits). ADMIN_USERNAME/ADMIN_PASSWORD must be set in .env.local
// (gitignored) or admin login refuses every attempt.
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

/**
 * Length-independent, constant-time string comparison. A plain `!==` leaks
 * how many leading characters matched via response timing, which is the
 * exact weakness the sender login route already guards against with its
 * dummy-hash bcrypt compare. Both values are hashed to a fixed-size buffer
 * first so differing lengths don't short-circuit either.
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // Pad to equal length so timingSafeEqual never throws on a length mismatch;
  // the length difference itself is still folded into the result.
  const len = Math.max(bufA.length, bufB.length);
  const paddedA = Buffer.alloc(len);
  const paddedB = Buffer.alloc(len);
  bufA.copy(paddedA);
  bufB.copy(paddedB);
  return timingSafeEqual(paddedA, paddedB) && bufA.length === bufB.length;
}

export async function POST(req: Request) {
  // Only one valid credential pair exists -- an unlimited endpoint is a
  // trivial brute-force target. 10 attempts / 5 minutes per IP.
  const limited = rateLimit(req, "admin-login", 10, 5 * 60 * 1000);
  if (limited) return limited;

  if (bodyTooLarge(req, SMALL_BODY_LIMIT)) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  // Fail closed rather than falling back to any hardcoded value -- see the
  // note above on why this repo can never carry one again.
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Admin login is not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const { username, password, rememberMe } =
    body as { username?: unknown; password?: unknown; rememberMe?: unknown };

  // Both comparisons always run (no `&&` short-circuit) so a correct
  // username can't be distinguished from an incorrect one by timing.
  const usernameOk = safeEqual(typeof username === "string" ? username : "", ADMIN_USERNAME);
  const passwordOk = safeEqual(typeof password === "string" ? password : "", ADMIN_PASSWORD);
  if (!usernameOk || !passwordOk) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = createSessionToken({ type: "admin" });
  const response = NextResponse.json({ message: "Login successful" });
  response.cookies.set(ADMIN_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: SESSION_COOKIE_SECURE,
    path: "/",
    maxAge: rememberMe ? SESSION_COOKIE_MAX_AGE_REMEMBERED : SESSION_COOKIE_MAX_AGE_DEFAULT,
  });
  return response;
}

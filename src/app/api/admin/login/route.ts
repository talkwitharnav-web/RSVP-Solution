import { NextResponse } from "next/server";
import {
  createSessionToken,
  ADMIN_SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_REMEMBERED,
  SESSION_COOKIE_MAX_AGE_DEFAULT,
  SESSION_COOKIE_SECURE,
} from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";

// Hardcoded admin credentials, matching the reference project's own
// pre-public-launch approach — see CLAUDE.md for a note to move these to
// real env vars before any non-local deployment.
const ADMIN_USERNAME = "darkglory";
const ADMIN_PASSWORD = "R$vp@dm!n";

export async function POST(req: Request) {
  // Only one valid credential pair exists -- an unlimited endpoint is a
  // trivial brute-force target. 10 attempts / 5 minutes per IP.
  const limited = rateLimit(req, "admin-login", 10, 5 * 60 * 1000);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const { username, password, rememberMe } =
    body as { username?: unknown; password?: unknown; rememberMe?: unknown };

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
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

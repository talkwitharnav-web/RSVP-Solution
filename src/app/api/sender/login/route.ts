import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { initDb, pool } from "@/lib/db";
import {
  createSessionToken,
  SENDER_SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_REMEMBERED,
  SESSION_COOKIE_MAX_AGE_DEFAULT,
  SESSION_COOKIE_SECURE,
  SESSION_TOKEN_MAX_AGE,
} from "@/lib/session";
import { createAuthSession } from "@/lib/auth-session-store";
import { rateLimit } from "@/lib/rate-limit";
import { bodyTooLarge, boundedText, SMALL_BODY_LIMIT, MAX_USERNAME_LENGTH } from "@/lib/validation";
import type { UserRecord } from "@/lib/types";

// Fixed bcrypt hash of an arbitrary string, compared against on every login
// attempt for a username that doesn't exist — keeps "no such user" and
// "wrong password" taking the same wall-clock time.
const DUMMY_PASSWORD_HASH = "$2b$10$qZdP0Cx2FBKOZ7WCJkmMuujpNg/PpCOe9fxOeLeKxus4Iar6rhObC";

export async function POST(req: Request) {
  // Credential-stuffing/brute-force protection, same rationale as admin
  // login. 10 attempts / 5 minutes per IP.
  const limited = rateLimit(req, "sender-login", 10, 5 * 60 * 1000);
  if (limited) return limited;

  if (bodyTooLarge(req, SMALL_BODY_LIMIT)) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  await initDb();
  const body = await req.json().catch(() => ({}));
  const { username, password, rememberMe } =
    body as { username?: unknown; password?: unknown; rememberMe?: unknown };

  const trimmedUsername = boundedText(username, MAX_USERNAME_LENGTH);
  const rawPassword = typeof password === "string" ? password : "";

  // lower(username) = lower($1), NOT `username ILIKE $1`: ILIKE treats % and
  // _ in the *user-supplied* value as wildcards, so a username of "%" would
  // match every row and hand back an arbitrary account for the password
  // check -- turning "guess a username and its password" into "guess any one
  // account's password." Exact case-insensitive comparison keeps the
  // intended case-insensitive login without the wildcard semantics.
  const result = await pool.query<UserRecord>(
    `SELECT * FROM users WHERE lower(username) = lower($1)`,
    [trimmedUsername],
  );
  const user = result.rows[0];

  const isPasswordValid = await bcrypt.compare(rawPassword, user?.password ?? DUMMY_PASSWORD_HASH);
  if (!user || !isPasswordValid) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const sessionId = await createAuthSession("sender", user.id, SESSION_TOKEN_MAX_AGE);
  const token = createSessionToken({
    type: "sender",
    sessionId,
    userId: user.id,
    username: user.username,
  });
  const response = NextResponse.json({ message: "Login successful" });
  response.cookies.set(SENDER_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: SESSION_COOKIE_SECURE,
    path: "/",
    maxAge: rememberMe ? SESSION_COOKIE_MAX_AGE_REMEMBERED : SESSION_COOKIE_MAX_AGE_DEFAULT,
  });
  return response;
}

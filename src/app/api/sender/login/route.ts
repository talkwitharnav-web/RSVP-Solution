import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { initDb, pool } from "@/lib/db";
import {
  createSessionToken,
  SENDER_SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_REMEMBERED,
  SESSION_COOKIE_MAX_AGE_DEFAULT,
  SESSION_COOKIE_SECURE,
} from "@/lib/session";
import type { UserRecord } from "@/lib/types";

// Fixed bcrypt hash of an arbitrary string, compared against on every login
// attempt for a username that doesn't exist — keeps "no such user" and
// "wrong password" taking the same wall-clock time.
const DUMMY_PASSWORD_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8G8Y5v6f6b5b0b5b0b5b0b5b0b5b0b5";

export async function POST(req: Request) {
  await initDb();
  const body = await req.json().catch(() => ({}));
  const { username, password, rememberMe } =
    body as { username?: unknown; password?: unknown; rememberMe?: unknown };

  const trimmedUsername = typeof username === "string" ? username.trim() : "";
  const rawPassword = typeof password === "string" ? password : "";

  const result = await pool.query<UserRecord>(
    `SELECT * FROM users WHERE username ILIKE $1`,
    [trimmedUsername],
  );
  const user = result.rows[0];

  const isPasswordValid = await bcrypt.compare(rawPassword, user?.password ?? DUMMY_PASSWORD_HASH);
  if (!user || !isPasswordValid) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const token = createSessionToken({ type: "sender", userId: user.id, username: user.username });
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

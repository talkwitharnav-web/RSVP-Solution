import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { initDb, pool } from "@/lib/db";
import { broadcastDbChanged } from "@/lib/ws-broadcast";
import {
  createSessionToken,
  SENDER_SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_REMEMBERED,
  SESSION_COOKIE_MAX_AGE_DEFAULT,
  SESSION_COOKIE_SECURE,
} from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import {
  bodyTooLarge,
  boundedText,
  SMALL_BODY_LIMIT,
  MAX_USERNAME_LENGTH,
  MAX_PERSON_NAME_LENGTH,
} from "@/lib/validation";

const SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: Request) {
  // Signup is unauthenticated by nature -- limit mass account creation.
  // 5 accounts / hour per IP.
  const limited = rateLimit(req, "sender-register", 5, 60 * 60 * 1000);
  if (limited) return limited;

  if (bodyTooLarge(req, SMALL_BODY_LIMIT)) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  await initDb();
  const body = await req.json().catch(() => ({}));
  const { name: rawName, username: rawUsername, password: rawPassword, rememberMe } =
    body as { name?: unknown; username?: unknown; password?: unknown; rememberMe?: unknown };

  const name = boundedText(rawName, MAX_PERSON_NAME_LENGTH);
  const username = boundedText(rawUsername, MAX_USERNAME_LENGTH);
  const password =
    typeof rawPassword === "string" &&
    rawPassword.length >= MIN_PASSWORD_LENGTH &&
    rawPassword.length <= 200 &&
    !rawPassword.includes("\0")
      ? rawPassword
      : null;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!username) {
    return NextResponse.json({ error: "Username is required" }, { status: 400 });
  }
  if (!password) {
    return NextResponse.json({ error: `Password must be ${MIN_PASSWORD_LENGTH}-200 characters` }, { status: 400 });
  }

  // lower(username) = lower($1), NOT `username ILIKE $1` -- see the same
  // note in the login route: % and _ in a user-supplied value are ILIKE
  // wildcards, so registering the username "%" would match every existing
  // row and report "already taken" for anything.
  const existing = await pool.query(`SELECT id FROM users WHERE lower(username) = lower($1)`, [username]);
  if (existing.rows[0]) {
    return NextResponse.json({ error: "That username is already taken" }, { status: 409 });
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  let userId: string;
  try {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO users (name, username, password, raw_password) VALUES ($1, $2, $3, $4) RETURNING id`,
      [name, username, hashedPassword, password],
    );
    userId = inserted.rows[0].id;
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "That username is already taken" }, { status: 409 });
    }
    throw err;
  }

  broadcastDbChanged("users");

  const token = createSessionToken({ type: "sender", userId, username });
  const response = NextResponse.json({ message: "Account created" }, { status: 201 });
  response.cookies.set(SENDER_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: SESSION_COOKIE_SECURE,
    path: "/",
    maxAge: rememberMe ? SESSION_COOKIE_MAX_AGE_REMEMBERED : SESSION_COOKIE_MAX_AGE_DEFAULT,
  });
  return response;
}

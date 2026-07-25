import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  verifySessionToken,
  ADMIN_SESSION_COOKIE_NAME,
  SENDER_SESSION_COOKIE_NAME,
} from "./session";

/** Verified admin session, or a 401 response to return as-is from the route handler. */
export async function requireAdmin(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const cookieStore = await cookies();
  const payload = verifySessionToken(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  if (payload?.type === "admin") return { ok: true };
  return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
}

/** Verified sender session, or a 401 response to return as-is from the route handler. */
export async function requireSender(): Promise<
  { ok: true; userId: string; username: string } | { ok: false; response: NextResponse }
> {
  const cookieStore = await cookies();
  const payload = verifySessionToken(cookieStore.get(SENDER_SESSION_COOKIE_NAME)?.value);
  if (payload?.type === "sender") return { ok: true, userId: payload.userId, username: payload.username };
  return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
}

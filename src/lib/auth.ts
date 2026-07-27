import { NextResponse } from "next/server";
import { headers as nextHeaders, cookies } from "next/headers";
import {
  verifySessionToken,
  ADMIN_SESSION_COOKIE_NAME,
  SENDER_SESSION_COOKIE_NAME,
} from "./session";
import { isLocalhostIp, clientIpFromHeaders } from "./network";

/**
 * Verified admin session, or a 401 response to return as-is from the route
 * handler. Also enforces localhost-only, redundantly with middleware.ts for
 * every admin route except DELETE /api/events/[slug] -- that one shares a
 * path with public GET/PUT on the same route, so it can't be blocked by
 * middleware's path-prefix matching and relies on this check being the only
 * enforcement point. Kept here (not just in middleware) so every
 * requireAdmin() call site is covered the same way regardless of route
 * shape, rather than splitting the guarantee across two different
 * mechanisms that a future route could fall between.
 */
export async function requireAdmin(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const headerList = await nextHeaders();
  if (!isLocalhostIp(clientIpFromHeaders(headerList))) {
    return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }

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

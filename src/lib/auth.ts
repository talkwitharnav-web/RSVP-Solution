import { NextResponse } from "next/server";
import { headers as nextHeaders, cookies } from "next/headers";
import {
  verifySessionToken,
  ADMIN_SESSION_COOKIE_NAME,
  SENDER_SESSION_COOKIE_NAME,
} from "./session";
import { isLocalhostIp, clientIpFromHeaders } from "./network";
import { initDb, pool } from "./db";

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

/**
 * Verified sender session, or a 401 response to return as-is from the route
 * handler.
 *
 * Checks the DB, not just the signature -- a signed cookie only proves this
 * app minted it at some point, not that the account it names is still
 * real. If a sender's account is deleted (Access DB, or any future admin
 * tool) while their browser still holds a validly-signed cookie for it,
 * every route guarded by this function used to keep accepting that cookie
 * indefinitely: the token itself never expires early just because its
 * subject was deleted. SessionWatcher.tsx (client-side, listening for a
 * live `user-deleted` WS broadcast) closes the common case -- an
 * already-open tab gets logged out within about a second of the delete --
 * but it depends on that tab's WebSocket actually being connected at the
 * moment the broadcast fires. A backgrounded tab whose socket dropped and
 * hasn't reconnected yet, a request fired from a stale cookie with no page
 * open at all (a saved bookmark, a replayed request), or the broadcast
 * simply being missed all fall through the live-push safety net -- this is
 * the server-side backstop that closes those regardless. One extra indexed
 * lookup per request against a handful of mutation/data routes (never a
 * hot rendering path) is a fine trade for that guarantee actually holding
 * unconditionally rather than "usually, if the tab's socket happened to be
 * up."
 */
export async function requireSender(): Promise<
  { ok: true; userId: string; username: string } | { ok: false; response: NextResponse }
> {
  const cookieStore = await cookies();
  const payload = verifySessionToken(cookieStore.get(SENDER_SESSION_COOKIE_NAME)?.value);
  if (payload?.type !== "sender") {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  await initDb();
  const result = await pool.query(`SELECT 1 FROM users WHERE id = $1`, [payload.userId]);
  if (result.rows.length === 0) {
    // The account is gone but the cookie is still technically well-formed --
    // clear it here too (not just via SessionWatcher's client-side
    // /api/logout call) so a request made with no page/JS involved at all
    // (e.g. a bookmarked API call) doesn't keep re-arriving with a cookie
    // that will only ever fail this same check.
    const response = NextResponse.json({ error: "This account no longer exists" }, { status: 401 });
    response.cookies.set(SENDER_SESSION_COOKIE_NAME, "", { maxAge: 0, path: "/" });
    return { ok: false, response };
  }

  return { ok: true, userId: payload.userId, username: payload.username };
}

/**
 * True if a request's client IP (as stamped onto x-forwarded-for by
 * server.js -- see its own comment for why that header, not a trusted
 * proxy header, is safe to read here) is the local machine itself.
 *
 * Used to keep admin-only surfaces (the gateway page, /admin/db, and their
 * backing API routes) reachable only from the machine running the dev
 * server, even though server.js now binds to 0.0.0.0 so the rest of the app
 * (sender dashboard, receiver pages) can be reached from other devices on
 * the LAN for testing. Admin was never meant to be LAN-exposed -- it holds
 * the one hardcoded credential pair and the DB console.
 */
export function isLocalhostIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const normalized = ip.trim();
  // No "unknown"/missing-header exception here on purpose -- server.js always
  // stamps the real socket address, so a missing/unresolved IP must fail
  // closed (treated as non-local), not open. Failing open on a missing value
  // would let a future change that drops the header silently reopen admin
  // to the whole LAN.
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "::ffff:127.0.0.1";
}

export function clientIpFromHeaders(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for");
  if (!forwardedFor) return null;
  return forwardedFor.split(",")[0].trim();
}

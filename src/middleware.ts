import { NextRequest, NextResponse } from "next/server";
import { isLocalhostIp, clientIpFromHeaders } from "@/lib/network";

// Admin-only surfaces -- the gateway page, the DB console, and their backing
// APIs -- stay localhost-only even though server.js now binds to 0.0.0.0 so
// the rest of the app (sender dashboard, receiver pages) can be reached from
// other devices on the LAN for testing. Admin holds the one hardcoded
// credential pair and full DB read/write/purge access; it was never meant
// to be LAN-exposed just because the app itself now is.
//
// Path-prefix matching here covers everything except DELETE /api/events/
// [slug], which shares a path with public GET/PUT on the same route --
// that one case is covered separately by the same isLocalhostIp() check
// inside requireAdmin() itself (src/lib/auth.ts), so every admin-gated call
// site is covered either by this middleware or by the auth helper.
const ADMIN_ONLY_PREFIXES = ["/admin", "/api/admin", "/api/dev", "/api/users"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAdminGateway = pathname === "/";
  const isAdminPrefixed = ADMIN_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!isAdminGateway && !isAdminPrefixed) return NextResponse.next();

  const ip = clientIpFromHeaders(req.headers);
  if (isLocalhostIp(ip)) return NextResponse.next();

  return pathname.startsWith("/api/")
    ? NextResponse.json({ error: "Not found" }, { status: 404 })
    : new NextResponse("Not found", { status: 404 });
}

export const config = {
  matcher: ["/", "/admin/:path*", "/api/admin/:path*", "/api/dev/:path*", "/api/users/:path*"],
};

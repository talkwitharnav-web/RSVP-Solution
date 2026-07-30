import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  verifySessionToken,
  ADMIN_SESSION_COOKIE_NAME,
  SENDER_SESSION_COOKIE_NAME,
} from "@/lib/session";
import { isAuthSessionActive } from "@/lib/auth-session-store";

export async function GET() {
  const cookieStore = await cookies();

  const adminCookie = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const senderCookie = cookieStore.get(SENDER_SESSION_COOKIE_NAME)?.value;
  const adminPayload = verifySessionToken(adminCookie);
  const senderPayload = verifySessionToken(senderCookie);
  const [isAdmin, isSender] = await Promise.all([
    adminPayload?.type === "admin"
      ? isAuthSessionActive(adminPayload.sessionId, "admin", null)
      : Promise.resolve(false),
    senderPayload?.type === "sender"
      ? isAuthSessionActive(senderPayload.sessionId, "sender", senderPayload.userId)
      : Promise.resolve(false),
  ]);

  // userId lets SessionWatcher confirm that a generic session-state broadcast
  // did not revoke this browser's own session. The broadcast itself carries
  // no account identifier.
  const sender =
    isSender && senderPayload?.type === "sender"
      ? { username: senderPayload.username, userId: senderPayload.userId }
      : null;

  const response = NextResponse.json(
    {
      authenticated: isAdmin || !!sender,
      admin: isAdmin,
      sender,
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
        "Expires": "0",
        "Pragma": "no-cache",
        "Vary": "Cookie",
      },
    },
  );
  if (adminCookie && !isAdmin) {
    response.cookies.set(ADMIN_SESSION_COOKIE_NAME, "", { maxAge: 0, path: "/" });
  }
  if (senderCookie && !isSender) {
    response.cookies.set(SENDER_SESSION_COOKIE_NAME, "", { maxAge: 0, path: "/" });
  }
  return response;
}

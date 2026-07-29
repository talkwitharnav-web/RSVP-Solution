import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  verifySessionToken,
  ADMIN_SESSION_COOKIE_NAME,
  SENDER_SESSION_COOKIE_NAME,
} from "@/lib/session";

export async function GET() {
  const cookieStore = await cookies();

  const adminPayload = verifySessionToken(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  const isAdmin = adminPayload?.type === "admin";

  const senderPayload = verifySessionToken(cookieStore.get(SENDER_SESSION_COOKIE_NAME)?.value);
  // userId included so a client can recognize a `user-deleted` WS broadcast
  // naming its own account (see src/lib/ws-broadcast.ts's
  // broadcastUserDeleted) -- the signed cookie already carries it, this just
  // surfaces it to the browser the same way username already was.
  const sender =
    senderPayload?.type === "sender" ? { username: senderPayload.username, userId: senderPayload.userId } : null;

  return NextResponse.json({
    authenticated: isAdmin || !!sender,
    admin: isAdmin,
    sender,
  });
}

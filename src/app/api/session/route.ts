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
  const sender = senderPayload?.type === "sender" ? { username: senderPayload.username } : null;

  return NextResponse.json({
    authenticated: isAdmin || !!sender,
    admin: isAdmin,
    sender,
  });
}

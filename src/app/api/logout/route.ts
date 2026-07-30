import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_SESSION_COOKIE_NAME,
  SENDER_SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";
import { revokeAuthSession } from "@/lib/auth-session-store";
import { bodyTooLarge, SMALL_BODY_LIMIT } from "@/lib/validation";

export async function POST(req: Request) {
  if (bodyTooLarge(req, SMALL_BODY_LIMIT)) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  const { type } = await req.json().catch(() => ({ type: undefined }));
  const cookieStore = await cookies();
  const adminPayload = verifySessionToken(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  const senderPayload = verifySessionToken(cookieStore.get(SENDER_SESSION_COOKIE_NAME)?.value);
  const clearAdmin = type !== "sender";
  const clearSender = type !== "admin";

  const revocations: Promise<void>[] = [];
  if (clearAdmin && adminPayload?.type === "admin") {
    revocations.push(revokeAuthSession(adminPayload.sessionId, "admin"));
  }
  if (clearSender && senderPayload?.type === "sender") {
    revocations.push(revokeAuthSession(senderPayload.sessionId, "sender"));
  }
  await Promise.all(revocations);

  const response = NextResponse.json({ message: "Logged out" });

  if (!clearSender) {
    response.cookies.set(ADMIN_SESSION_COOKIE_NAME, "", { maxAge: 0, path: "/" });
  } else if (!clearAdmin) {
    response.cookies.set(SENDER_SESSION_COOKIE_NAME, "", { maxAge: 0, path: "/" });
  } else {
    response.cookies.set(ADMIN_SESSION_COOKIE_NAME, "", { maxAge: 0, path: "/" });
    response.cookies.set(SENDER_SESSION_COOKIE_NAME, "", { maxAge: 0, path: "/" });
  }
  return response;
}

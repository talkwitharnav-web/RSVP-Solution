import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { initDb, pool } from "@/lib/db";
import { verifySessionToken, SENDER_SESSION_COOKIE_NAME } from "@/lib/session";
import { isAuthSessionActive } from "@/lib/auth-session-store";
import { toPublicEventRecord } from "@/lib/public-event";
import type { EventRecord } from "@/lib/types";
import GuestEventView from "./GuestEventView";

async function getEvent(slug: string): Promise<EventRecord | null> {
  await initDb();
  const result = await pool.query(`SELECT * FROM events WHERE slug = $1`, [slug]);
  if (result.rows.length === 0) return null;
  return result.rows[0] as EventRecord;
}

/**
 * The real guest-facing route -- "invitations will be under /receiver"
 * (2026-07 decision). A draft (unpublished) invitation 404s for everyone
 * except the sender who owns it, so a guest can never stumble onto a link
 * before its sender has actually hit Publish. The owner hitting this same
 * route (e.g. via "Preview as Receiver" in EventEditor) sees the exact same
 * render a guest would -- no separate preview mode -- so there's no way for
 * the preview to drift from what a real guest experiences.
 */
export default async function ReceiverPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEvent(slug);
  if (!event) notFound();

  if (!event.published) {
    const cookieStore = await cookies();
    const senderSession = verifySessionToken(cookieStore.get(SENDER_SESSION_COOKIE_NAME)?.value);
    const isOwner = senderSession?.type === "sender" && senderSession.userId === event.created_by
      ? await isAuthSessionActive(senderSession.sessionId, "sender", senderSession.userId)
      : false;
    if (!isOwner) notFound();
  }

  return <GuestEventView initialEvent={toPublicEventRecord(event)} />;
}

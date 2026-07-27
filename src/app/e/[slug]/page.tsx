import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { initDb, pool } from "@/lib/db";
import { verifySessionToken, SENDER_SESSION_COOKIE_NAME } from "@/lib/session";
import type { EventRecord } from "@/lib/types";
import EventEditor from "./EventEditor";

async function getEvent(slug: string): Promise<EventRecord | null> {
  await initDb();
  const result = await pool.query(`SELECT * FROM events WHERE slug = $1`, [slug]);
  if (result.rows.length === 0) return null;
  return result.rows[0] as EventRecord;
}

/**
 * The sender's edit surface -- distinct from /receiver/[slug], the guest-
 * facing route. Only the owning sender can reach the real editor here;
 * anyone else (no session, a different sender) is sent to the public
 * receiver link instead of seeing edit affordances for someone else's card.
 */
export default async function EventEditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEvent(slug);
  if (!event) notFound();

  const cookieStore = await cookies();
  const senderSession = verifySessionToken(cookieStore.get(SENDER_SESSION_COOKIE_NAME)?.value);
  const isOwner = senderSession?.type === "sender" && senderSession.userId === event.created_by;

  if (!isOwner) redirect(`/receiver/${slug}`);

  return <EventEditor initialEvent={event} />;
}

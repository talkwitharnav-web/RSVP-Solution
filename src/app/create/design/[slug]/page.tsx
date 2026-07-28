import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { initDb, pool } from "@/lib/db";
import { verifySessionToken, SENDER_SESSION_COOKIE_NAME } from "@/lib/session";
import type { EventRecord } from "@/lib/types";
import DesignEditor from "../DesignEditor";

async function getEvent(slug: string): Promise<EventRecord | null> {
  await initDb();
  const result = await pool.query(`SELECT * FROM events WHERE slug = $1`, [slug]);
  if (result.rows.length === 0) return null;
  return result.rows[0] as EventRecord;
}

/**
 * The permanent editor for an already-created designed_template invitation
 * -- its own unique link, per explicit user instruction that once an
 * invitation exists you should always come back to the same place to keep
 * working on it. Owner-gated the same way /e/[slug] is; a non-owner (or
 * anyone trying this on a non-designed_template event) is sent to the
 * public receiver link instead of seeing editor chrome for a card that
 * isn't theirs or doesn't have a design to edit.
 */
export default async function EditDesignPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEvent(slug);
  if (!event) notFound();
  if (event.kind !== "designed_template") redirect(`/e/${slug}`);

  const cookieStore = await cookies();
  const senderSession = verifySessionToken(cookieStore.get(SENDER_SESSION_COOKIE_NAME)?.value);
  const isOwner = senderSession?.type === "sender" && senderSession.userId === event.created_by;

  if (!isOwner) redirect(`/receiver/${slug}`);

  return <DesignEditor initialEvent={event} />;
}

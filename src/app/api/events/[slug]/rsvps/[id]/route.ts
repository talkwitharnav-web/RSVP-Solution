import { NextRequest, NextResponse } from "next/server";
import { initDb, pool } from "@/lib/db";
import { requireSender } from "@/lib/auth";
import { broadcastDbChanged } from "@/lib/ws-broadcast";

/**
 * Removes a single RSVP -- the sender's fix for a guest who submitted the
 * wrong answer (there's no guest-facing edit; a guest can only submit).
 *
 * Gated on actually owning the event, not just being a logged-in sender,
 * same as the stats route this is reached from. The RSVP id is also matched
 * against that event's id in the DELETE itself, so a valid id belonging to
 * someone else's event can't be deleted by passing it under a slug you do
 * own.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const auth = await requireSender();
  if (!auth.ok) return auth.response;

  await initDb();
  const { slug, id } = await params;

  // Postgres raises a syntax error (a 500) rather than matching nothing if
  // a non-UUID reaches a uuid comparison, so a malformed id is treated as
  // "no such RSVP" here instead.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "RSVP not found" }, { status: 404 });
  }

  const eventResult = await pool.query(`SELECT id, created_by FROM events WHERE slug = $1`, [slug]);
  if (eventResult.rows.length === 0) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (eventResult.rows[0].created_by !== auth.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deleted = await pool.query(`DELETE FROM rsvps WHERE id = $1 AND event_id = $2 RETURNING id`, [
    id,
    eventResult.rows[0].id,
  ]);
  if (deleted.rows.length === 0) {
    return NextResponse.json({ error: "RSVP not found" }, { status: 404 });
  }

  broadcastDbChanged("events");
  return NextResponse.json({ ok: true });
}

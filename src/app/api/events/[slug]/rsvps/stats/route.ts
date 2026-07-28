import { NextRequest, NextResponse } from "next/server";
import { initDb, pool } from "@/lib/db";
import { requireSender } from "@/lib/auth";

/**
 * Per-event RSVP stats for the sender dashboard's Statistics view -- gated
 * on actually owning the event (same pattern as PUT /api/events/[slug]),
 * not just being logged in as some sender, since guest RSVP data is
 * sensitive to the host it belongs to.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireSender();
  if (!auth.ok) return auth.response;

  await initDb();
  const { slug } = await params;

  const eventResult = await pool.query(`SELECT id, created_by, guest_categories FROM events WHERE slug = $1`, [slug]);
  if (eventResult.rows.length === 0) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  const event = eventResult.rows[0];
  if (event.created_by !== auth.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rsvpsResult = await pool.query(
    `SELECT id, guest_name, attending, guest_count, category_counts, created_at
     FROM rsvps WHERE event_id = $1 ORDER BY created_at ASC`,
    [event.id],
  );

  return NextResponse.json({
    guestCategories: event.guest_categories,
    rsvps: rsvpsResult.rows,
  });
}

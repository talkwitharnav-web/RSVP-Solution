import { NextRequest, NextResponse } from "next/server";
import { initDb, pool } from "@/lib/db";
import { broadcastDbChanged } from "@/lib/ws-broadcast";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  // No auth gate exists on RSVP submission by design (any guest with a
  // published link can respond) -- rate limit by IP so a script can't spam
  // fake RSVPs against a published event. 20 submissions / 10 minutes per
  // IP; loose enough for a household RSVPing together from one connection.
  const limited = rateLimit(req, "rsvp-submit", 20, 10 * 60 * 1000);
  if (limited) return limited;

  await initDb();
  const { slug } = await params;
  const body = await req.json();

  const guestName = String(body.guestName ?? "").trim();
  if (!guestName) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const attending = Boolean(body.attending);
  const answers = typeof body.answers === "object" && body.answers !== null ? body.answers : {};

  const eventResult = await pool.query(`SELECT id, guest_categories, published FROM events WHERE slug = $1`, [slug]);
  if (eventResult.rows.length === 0) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  // A draft can't be RSVP'd to even if someone has the slug -- the
  // corresponding /receiver/[slug] page itself already 404s pre-publish for
  // anyone but the owner, so this is defense in depth against a direct API
  // call bypassing that page-level gate.
  if (!eventResult.rows[0].published) {
    return NextResponse.json({ error: "This invitation hasn't been published yet" }, { status: 404 });
  }
  const eventId = eventResult.rows[0].id;
  const guestCategories: string[] = eventResult.rows[0].guest_categories;

  // category_counts is keyed by the event's own guest_categories (e.g.
  // {"Adults": 2, "Kids": 1}) -- only categories the event actually defines
  // are kept, and each count is clamped to [0, MAX_CATEGORY_COUNT], so a
  // malformed/malicious body can't inject arbitrary keys, negative values,
  // or an absurd count (e.g. 999999999) that a direct API call could send
  // even though the client form itself caps the input. guest_count stays a
  // stored derived sum for anything still reading that column, computed
  // from the same clamped counts rather than trusted as its own
  // client-supplied number.
  const MAX_CATEGORY_COUNT = 999;
  const rawCounts = typeof body.categoryCounts === "object" && body.categoryCounts !== null ? body.categoryCounts : {};
  const categoryCounts: Record<string, number> = {};
  for (const category of guestCategories) {
    const value = Number(rawCounts[category]);
    categoryCounts[category] = Number.isFinite(value) ? Math.min(MAX_CATEGORY_COUNT, Math.max(0, Math.trunc(value))) : 0;
  }
  const guestCount = Object.values(categoryCounts).reduce((sum, n) => sum + n, 0) || 1;

  await pool.query(
    `INSERT INTO rsvps (event_id, guest_name, attending, guest_count, category_counts, answers)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [eventId, guestName, attending, guestCount, JSON.stringify(categoryCounts), JSON.stringify(answers)],
  );

  broadcastDbChanged("events");
  return NextResponse.json({ ok: true }, { status: 201 });
}

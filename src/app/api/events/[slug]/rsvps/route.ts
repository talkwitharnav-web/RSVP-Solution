import { NextRequest, NextResponse } from "next/server";
import { initDb, pool } from "@/lib/db";
import { broadcastDbChanged } from "@/lib/ws-broadcast";
import { rateLimit } from "@/lib/rate-limit";
import {
  bodyTooLarge,
  boundedText,
  SMALL_BODY_LIMIT,
  MAX_PERSON_NAME_LENGTH,
  MAX_ANSWER_LENGTH,
} from "@/lib/validation";
import type { RsvpQuestion } from "@/lib/types";

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

  if (bodyTooLarge(req, SMALL_BODY_LIMIT)) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  await initDb();
  const { slug } = await params;
  const body = await req.json().catch(() => ({}));

  const guestName = boundedText(body.guestName, MAX_PERSON_NAME_LENGTH);
  if (!guestName) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const attending = Boolean(body.attending);

  const eventResult = await pool.query(
    `SELECT id, guest_categories, questions, published FROM events WHERE slug = $1`,
    [slug],
  );
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
  const questions: RsvpQuestion[] = eventResult.rows[0].questions ?? [];

  // answers used to be stored verbatim as whatever JSON the body contained,
  // with no key filtering and no size bound -- so a direct API call could
  // write arbitrary (and arbitrarily large) JSON into the column. Same
  // treatment as categoryCounts below: only keys the event actually defines
  // survive, and each value is coerced to a bounded string or boolean.
  const rawAnswers =
    typeof body.answers === "object" && body.answers !== null
      ? (body.answers as Record<string, unknown>)
      : {};
  const answers: Record<string, string | boolean> = {};
  for (const question of questions) {
    const value = rawAnswers[question.id];
    if (value === undefined) continue;
    if (question.type === "boolean") {
      // RsvpForm's yes/no <select> submits the strings "yes"/"no", so a plain
      // Boolean() would turn "no" into true. Anything that isn't an
      // affirmative reads as false.
      answers[question.id] = value === true || value === "yes" || value === "true";
    } else {
      answers[question.id] = boundedText(value, MAX_ANSWER_LENGTH);
    }
  }

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

import { NextRequest, NextResponse } from "next/server";
import { initDb, pool } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  await initDb();
  const { slug } = await params;
  const body = await req.json();

  const guestName = String(body.guestName ?? "").trim();
  if (!guestName) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const attending = Boolean(body.attending);
  const guestCount = Number.isFinite(body.guestCount) ? Math.max(1, Math.trunc(body.guestCount)) : 1;
  const answers = typeof body.answers === "object" && body.answers !== null ? body.answers : {};

  const eventResult = await pool.query(`SELECT id FROM events WHERE slug = $1`, [slug]);
  if (eventResult.rows.length === 0) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  const eventId = eventResult.rows[0].id;

  await pool.query(
    `INSERT INTO rsvps (event_id, guest_name, attending, guest_count, answers)
     VALUES ($1, $2, $3, $4, $5)`,
    [eventId, guestName, attending, guestCount, JSON.stringify(answers)],
  );

  return NextResponse.json({ ok: true }, { status: 201 });
}

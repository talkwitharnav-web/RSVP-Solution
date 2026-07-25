import { NextRequest, NextResponse } from "next/server";
import { initDb, pool } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { broadcastDbChanged } from "@/lib/ws-broadcast";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  await initDb();
  const { slug } = await params;

  const result = await pool.query(`SELECT * FROM events WHERE slug = $1`, [slug]);
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  return NextResponse.json(result.rows[0]);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  await initDb();
  const { slug } = await params;

  const result = await pool.query(`DELETE FROM events WHERE slug = $1 RETURNING slug`, [slug]);
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  broadcastDbChanged("events");
  return NextResponse.json({ message: "Event deleted successfully" });
}

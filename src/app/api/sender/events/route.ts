import { NextResponse } from "next/server";
import { initDb, pool } from "@/lib/db";
import { requireSender } from "@/lib/auth";

export async function GET() {
  const auth = await requireSender();
  if (!auth.ok) return auth.response;

  await initDb();
  const result = await pool.query(
    `SELECT * FROM events WHERE created_by = $1 ORDER BY created_at DESC`,
    [auth.userId],
  );

  return NextResponse.json({ events: result.rows });
}

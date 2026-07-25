import { NextResponse } from "next/server";
import { initDb, pool } from "@/lib/db";

export async function GET() {
  await initDb();
  const result = await pool.query(`SELECT 1 FROM users LIMIT 1`);
  return NextResponse.json({ hasAccount: result.rows.length > 0 });
}

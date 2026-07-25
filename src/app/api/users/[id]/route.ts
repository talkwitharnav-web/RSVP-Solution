import { NextRequest, NextResponse } from "next/server";
import { initDb, pool } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await initDb();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const name = String(body.name ?? "").trim();
  const username = String(body.username ?? "").trim();
  if (!name || !username) {
    return NextResponse.json({ error: "Name and username are required" }, { status: 400 });
  }

  const result = await pool.query(
    `UPDATE users SET name = $1, username = $2 WHERE id = $3 RETURNING *`,
    [name, username, id],
  );
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(result.rows[0]);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await initDb();
  const { id } = await params;

  const result = await pool.query(`DELETE FROM users WHERE id = $1 RETURNING id`, [id]);
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ message: "User deleted successfully" });
}

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { initDb, pool } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { broadcastDbChanged } from "@/lib/ws-broadcast";

const SALT_ROUNDS = 10;

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  await initDb();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const newPassword = String(body.newPassword ?? "");
  if (!newPassword) {
    return NextResponse.json({ error: "New password is required" }, { status: 400 });
  }

  const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const result = await pool.query(
    `UPDATE users SET password = $1, raw_password = $2 WHERE id = $3 RETURNING id`,
    [hashed, newPassword, id],
  );
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  broadcastDbChanged("users");
  return NextResponse.json({ message: "Password updated successfully" });
}

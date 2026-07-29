import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { initDb, pool } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { broadcastDbChanged } from "@/lib/ws-broadcast";
import { bodyTooLarge, SMALL_BODY_LIMIT } from "@/lib/validation";

const SALT_ROUNDS = 10;
// Same bounds signup enforces -- an admin-initiated reset shouldn't be able
// to put an account into a state the user could never have created.
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  if (bodyTooLarge(req, SMALL_BODY_LIMIT)) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  await initDb();
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));

  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (
    newPassword.length < MIN_PASSWORD_LENGTH ||
    newPassword.length > MAX_PASSWORD_LENGTH ||
    newPassword.includes("\0")
  ) {
    return NextResponse.json(
      { error: `Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters` },
      { status: 400 },
    );
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

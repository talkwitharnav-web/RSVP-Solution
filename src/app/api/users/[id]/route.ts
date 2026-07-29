import { NextRequest, NextResponse } from "next/server";
import { initDb, pool } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { broadcastDbChanged } from "@/lib/ws-broadcast";
import {
  bodyTooLarge,
  boundedText,
  SMALL_BODY_LIMIT,
  MAX_USERNAME_LENGTH,
  MAX_PERSON_NAME_LENGTH,
} from "@/lib/validation";

// Postgres throws "invalid input syntax for type uuid" (a 500) rather than
// simply matching no rows when a non-UUID id reaches a UUID comparison, so
// the shape is checked here and treated as a plain 404 instead.
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

  const name = boundedText(body.name, MAX_PERSON_NAME_LENGTH);
  const username = boundedText(body.username, MAX_USERNAME_LENGTH);
  if (!name || !username) {
    return NextResponse.json({ error: "Name and username are required" }, { status: 400 });
  }

  // Renaming to an already-taken username violates the unique constraint.
  // That used to escape as an unhandled 500; it's a normal, expected outcome
  // of an admin typing a name that already exists.
  let result;
  try {
    result = await pool.query(
      `UPDATE users SET name = $1, username = $2 WHERE id = $3 RETURNING *`,
      [name, username, id],
    );
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "That username is already taken" }, { status: 409 });
    }
    throw err;
  }
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  broadcastDbChanged("users");
  return NextResponse.json(result.rows[0]);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  await initDb();
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const result = await pool.query(`DELETE FROM users WHERE id = $1 RETURNING id`, [id]);
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  broadcastDbChanged("users");
  return NextResponse.json({ message: "User deleted successfully" });
}

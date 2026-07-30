import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { initDb, pool } from "@/lib/db";
import { generateSlug } from "@/lib/slug";
import { requireAdmin } from "@/lib/auth";
import { broadcastDbChanged } from "@/lib/ws-broadcast";
import type { AdminEventSummary } from "@/lib/types";

const SALT_ROUNDS = 10;
const ADMIN_PAGE_SIZE = 100;

function safeOffset(value: string | null): number {
  const offset = Number(value);
  return Number.isSafeInteger(offset) && offset > 0 ? offset : 0;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  await initDb();
  const table = req.nextUrl.searchParams.get("table");
  const includeUsers = table !== "events";
  const includeEvents = table !== "users";
  const userOffset = safeOffset(req.nextUrl.searchParams.get("userOffset"));
  const eventOffset = safeOffset(req.nextUrl.searchParams.get("eventOffset"));

  const [usersResult, eventsResult] = await Promise.all([
    includeUsers
      ? pool.query(
          `SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
          [ADMIN_PAGE_SIZE + 1, userOffset],
        )
      : Promise.resolve({ rows: [] }),
    includeEvents
      ? pool.query<AdminEventSummary>(
          `SELECT id, slug, kind, title, created_at
           FROM events
           ORDER BY created_at DESC
           LIMIT $1 OFFSET $2`,
          [ADMIN_PAGE_SIZE + 1, eventOffset],
        )
      : Promise.resolve({ rows: [] as AdminEventSummary[] }),
  ]);
  const users = usersResult.rows.slice(0, ADMIN_PAGE_SIZE);
  const events = eventsResult.rows.slice(0, ADMIN_PAGE_SIZE);

  return NextResponse.json({
    users,
    events,
    nextUserOffset: includeUsers && usersResult.rows.length > ADMIN_PAGE_SIZE
      ? userOffset + users.length
      : null,
    nextEventOffset: includeEvents && eventsResult.rows.length > ADMIN_PAGE_SIZE
      ? eventOffset + events.length
      : null,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  await initDb();
  const body = await req.json().catch(() => ({}));

  if (body.action !== "seed") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  await pool.query("DELETE FROM rsvps");
  await pool.query("DELETE FROM events");
  await pool.query("DELETE FROM users");

  const sampleUsers = [
    { name: "Jordan Lee", username: "jordanlee" },
    { name: "Priya Nair", username: "priyanair" },
    { name: "Sam Osei", username: "samosei" },
  ];
  for (const u of sampleUsers) {
    const password = "password123";
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    await pool.query(
      `INSERT INTO users (name, username, password, raw_password) VALUES ($1, $2, $3, $4)`,
      [u.name, u.username, hashed, password],
    );
  }

  const sampleEvents = [
    {
      kind: "custom_card",
      title: "Jordan's Birthday Bash",
      host_name: "Jordan Lee",
      description: "Come celebrate!",
      location: "The Lee House",
    },
    {
      kind: "external_link",
      title: "Priya's Baby Shower",
      host_name: "Priya Nair",
      description: "RSVP via the linked form",
      external_url: "https://forms.gle/example",
    },
    {
      kind: "custom_card",
      title: "Sam's Housewarming",
      host_name: "Sam Osei",
      description: "New place, same great Sam",
      location: "221B Baker Street",
    },
  ];
  for (const e of sampleEvents) {
    const slug = generateSlug();
    await pool.query(
      `INSERT INTO events (slug, kind, title, host_name, description, location, external_url, questions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        slug,
        e.kind,
        e.title,
        e.host_name,
        e.description,
        e.location ?? null,
        e.external_url ?? null,
        JSON.stringify([]),
      ],
    );
  }

  broadcastDbChanged("users");
  broadcastDbChanged("events");
  return NextResponse.json({ message: "Seeded 3 users and 3 sample events!" });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  if (body.confirmation !== "PURGE DATABASE") {
    return NextResponse.json({ error: "Type PURGE DATABASE to confirm" }, { status: 400 });
  }

  await initDb();
  await pool.query("DELETE FROM rsvps");
  await pool.query("DELETE FROM events");
  await pool.query("DELETE FROM users");

  broadcastDbChanged("users");
  broadcastDbChanged("events");
  return NextResponse.json({ message: "Database purged successfully" });
}

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { initDb, pool } from "@/lib/db";
import { generateSlug } from "@/lib/slug";

const SALT_ROUNDS = 10;

export async function GET() {
  await initDb();

  const [usersResult, eventsResult] = await Promise.all([
    pool.query(`SELECT * FROM users ORDER BY created_at DESC`),
    pool.query(`SELECT * FROM events ORDER BY created_at DESC`),
  ]);

  return NextResponse.json({
    users: usersResult.rows,
    events: eventsResult.rows,
  });
}

export async function POST(req: NextRequest) {
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
      kind: "hosted_template",
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
      kind: "hosted_template",
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

  return NextResponse.json({ message: "Seeded 3 users and 3 sample events!" });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body.confirmation !== "PURGE DATABASE") {
    return NextResponse.json({ error: "Type PURGE DATABASE to confirm" }, { status: 400 });
  }

  await initDb();
  await pool.query("DELETE FROM rsvps");
  await pool.query("DELETE FROM events");
  await pool.query("DELETE FROM users");

  return NextResponse.json({ message: "Database purged successfully" });
}

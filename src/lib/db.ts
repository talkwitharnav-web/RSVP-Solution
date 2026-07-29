import { Pool } from "pg";

declare global {
  var __rsvpPgPool: Pool | undefined;
}

export const pool =
  global.__rsvpPgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  global.__rsvpPgPool = pool;
}

let initPromise: Promise<void> | null = null;

export function initDb(): Promise<void> {
  if (!initPromise) {
    // Clear the memo on failure so the next request retries. Without this, a
    // single transient failure (Postgres not up yet on a cold start) caches a
    // permanently-rejected promise, and every later request in the process
    // re-throws that same original error until the server is restarted.
    initPromise = migrate().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL CHECK (kind IN ('external_link', 'custom_card', 'designed_template')),
      title TEXT NOT NULL,
      host_name TEXT,
      description TEXT,
      event_date TIMESTAMPTZ,
      location TEXT,
      external_url TEXT,
      questions JSONB NOT NULL DEFAULT '[]',
      card_image_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // card_image_url/kind's custom_card option were added after the table
  // originally shipped -- ALTERs so anyone with an existing dev DB migrates
  // forward instead of needing a manual DROP TABLE.
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS card_image_url TEXT;`);
  // DROP then ADD in one statement (not two separate pool.query calls) so
  // they run in the same round trip -- Postgres has no
  // "ADD CONSTRAINT IF NOT EXISTS", and running the drop/add as two
  // separate queries left a window where a second process's migrate() call
  // (e.g. a dev-server restart racing an in-flight request) could see the
  // constraint gone between the DROP and the ADD, then fail with
  // "constraint already exists" when both tried to ADD it back.
  await pool.query(`
    ALTER TABLE events DROP CONSTRAINT IF EXISTS events_kind_check;
    ALTER TABLE events ADD CONSTRAINT events_kind_check CHECK (kind IN ('external_link', 'custom_card', 'designed_template'));
  `);

  // design_config: the sender's template/palette/font/icon choices + any
  // slot drag/resize overrides for a 'designed_template' event -- see
  // src/lib/design-types.ts and "custom rsvp card designer.md" section 7.
  // NULL for every other EventKind.
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS design_config JSONB;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rsvps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      guest_name TEXT NOT NULL,
      attending BOOLEAN NOT NULL,
      guest_count INTEGER NOT NULL DEFAULT 1,
      answers JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS rsvps_event_id_idx ON rsvps(event_id);
  `);

  // guest_categories: sender-defined category labels for a "how many of each"
  // breakdown (e.g. ["Adults", "Kids"], or any custom comma-separated list --
  // see src/lib/guest-categories.ts). Defaults to the standard two so every
  // existing/new event has a sane breakdown without the sender configuring
  // anything. category_counts on rsvps is the per-submission breakdown keyed
  // by those same category labels; guest_count stays a stored derived sum
  // (backward-compatible with anything already reading it) rather than being
  // replaced outright.
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS guest_categories JSONB NOT NULL DEFAULT '["Adults", "Kids"]';`);
  await pool.query(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS category_counts JSONB NOT NULL DEFAULT '{}';`);

  // published gates /receiver/[slug] -- a draft invitation isn't guessable
  // by a guest before the sender explicitly hits Publish. The slug itself
  // never changes across publish/re-edit/resend, so an already-shared link
  // keeps working through any number of later edits (only the content
  // changes) -- see EventEditor's Publish button and /receiver/[slug].
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT false;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      raw_password TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // created_by needs the users table to exist first, so it's added here
  // rather than in events' own CREATE TABLE block above.
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;`);
  await pool.query(`CREATE INDEX IF NOT EXISTS events_created_by_idx ON events(created_by);`);

  // Login and signup both look users up case-insensitively
  // (lower(username) = lower($1)), but the column's own UNIQUE constraint is
  // case-sensitive -- so "Bob" and "bob" could both exist as separate rows
  // and the login lookup would then match two rows and pick one arbitrarily.
  // This index makes the database enforce the same uniqueness rule the auth
  // code assumes. Tolerated (not fatal) if it can't be created, since a dev
  // database that already contains case-duplicate usernames would otherwise
  // fail to start at all -- the warning says exactly what to clean up.
  try {
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username));`);
  } catch {
    console.warn(
      "[db] Could not create users_username_lower_idx — the users table likely already " +
      "contains usernames that differ only by case. Resolve those duplicates so " +
      "case-insensitive login stays unambiguous.",
    );
  }
}

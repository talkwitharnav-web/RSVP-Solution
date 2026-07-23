# SYSTEM_MEMORY.md

Current technical truth for the RSVP app. Narrative history and working-style notes live in `CLAUDE.md`.

## Stack

- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 — scaffolded via `create-next-app` on 2026-07-23.
- PostgreSQL via `pg` (no ORM), connection via `DATABASE_URL` env var.
- `nanoid` for short public slugs, `qrcode` installed but not yet wired into any page.
- Dev server: `npm run dev`. No custom server (`server.js`) yet — plain `next dev` is fine, nothing needs a raw WebSocket/HTTP upgrade yet.

## Environment

- Local Postgres runs via Docker: `docker-compose.yml` defines a single `postgres:16` service, container name `rsvp-postgres-1`, port `5432`, db `rsvp_dev`, user/pass `postgres`/`postgres`, data in the named volume `rsvp-postgres-data`. Start with `docker compose up -d`, matching the other project's Docker-based local Postgres.
- Copy `.env.local.example` to `.env.local` (`DATABASE_URL=postgres://postgres:postgres@localhost:5432/rsvp_dev` — already matches the compose defaults). `.env*` is gitignored.
- `npm run dev` needs the container up first; `initDb()` migrates on first DB access per process, same as the other project.

## Architecture

### Routes

| Route | Purpose |
|---|---|
| `/` | Landing page, links to both create flows |
| `/create/link` | Form to create a "bring your own link" event |
| `/create/template` | Form to create a "hosted template" event, including ad hoc extra questions |
| `/e/[slug]` | Public event page. Renders host-provided details; either an outbound "RSVP now" link (external_link) or the hosted `RsvpForm` (hosted_template) |
| `POST /api/events` | Create an event (either kind); returns `{ slug }` |
| `GET /api/events/[slug]` | Fetch one event by slug |
| `POST /api/events/[slug]/rsvps` | Submit a guest RSVP against an event |

### Data model

`src/lib/db.ts` owns the Postgres pool (memoized on `globalThis` in dev to survive HMR) and `initDb()`, an idempotent migration runner memoized per-process — same shape as the reference project's `initDb()`. Called at the top of every route/page that touches the DB.

**`events`**
- `id UUID PK`, `slug TEXT UNIQUE` (nanoid, 8 chars, non-ambiguous alphabet — see `src/lib/slug.ts`)
- `kind TEXT CHECK IN ('external_link', 'hosted_template')`
- `title TEXT NOT NULL`, `host_name`, `description`, `event_date TIMESTAMPTZ`, `location`
- `external_url` — set only when `kind = 'external_link'`
- `questions JSONB` — array of `RsvpQuestion` (`{ id, label, type: 'text'|'boolean', required }`), set only when `kind = 'hosted_template'`
- `created_at TIMESTAMPTZ DEFAULT now()`

**`rsvps`**
- `id UUID PK`, `event_id UUID FK -> events(id) ON DELETE CASCADE`
- `guest_name TEXT NOT NULL`, `attending BOOLEAN NOT NULL`, `guest_count INTEGER DEFAULT 1`
- `answers JSONB DEFAULT '{}'` — keyed by the event's `questions[].id`
- `created_at TIMESTAMPTZ DEFAULT now()`
- Index on `event_id`

Types mirrored in TypeScript at `src/lib/types.ts` (`EventRecord`, `RsvpRecord`, `EventKind`, `RsvpQuestion`).

## Current State / What's Built

As of 2026-07-23 (initial scaffold commit):

- Both create flows (`/create/link`, `/create/template`) are functional client forms posting to `POST /api/events`, redirecting to `/e/[slug]` on success.
- `/e/[slug]` renders correctly for both event kinds; the hosted RSVP form (`RsvpForm.tsx`) posts to `POST /api/events/[slug]/rsvps` and shows a plain confirmation message on success.
- `npx tsc --noEmit` and `npx eslint .` both pass clean.
- Dev server boots and `/`, `/create/link`, `/create/template` all return 200.
- Full DB-backed loop verified live against real Postgres (Docker) on 2026-07-23: created a `hosted_template` event via `POST /api/events`, loaded `/e/[slug]` (200), submitted an RSVP via `POST /api/events/[slug]/rsvps`, confirmed both rows landed correctly via `psql` (including `answers` JSONB round-tripping). Test rows were deleted afterward.

## Explicitly NOT built yet

- No host-facing dashboard/guest list view (a host currently has no way to see who RSVP'd — only the DB holds that).
- No auth of any kind — anyone with an event's slug can view it; anyone can submit an RSVP. No spam/rate-limiting.
- No visual template customization (colors, images, layout) — template events all render through one fixed layout.
- No QR code generation on the event page yet, despite the package being installed.
- No tests.
- No production deployment/hosting decision made.

## Next Likely Steps (not started)

- Add a minimal host view (e.g. `/e/[slug]/manage` or similar) to see submitted RSVPs — needed before this is genuinely useful to a real host, even at proof-of-concept level.
- Wire up `qrcode` on the event page for easy sharing.

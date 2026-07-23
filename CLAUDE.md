# CLAUDE.md

Narrative decisions and working style for this RSVP project. Read `SYSTEM_MEMORY.md` first for current architecture/schema/routes; this file explains why settled choices exist and how to work with the user.

## What this project is

An RSVP website. A host creates an RSVP page one of two ways, gets a shareable link, and guests open that link to RSVP:

- **Bring your own link** — host supplies a title + their existing external RSVP URL (Google Form, Partiful, etc). Our page is a thin branded landing page that hands guests off to that link.
- **Build a template here** — host fills in event details and picks a few RSVP questions (attending y/n, guest count, free-text/yes-no questions). We host the actual form and store responses.

Current milestone (2026-07-23): get a working end-to-end proof of concept for both flows — not a polished/customizable product yet. The user explicitly wants to first prove "yeah this CAN work" before expanding scope.

## The User and Working Style

- Vibe-codes projects; wants plain-English explanations, not jargon-heavy architecture debates. Do the coding and stack-trace interpretation yourself.
- Has another project (a restaurant order tracker) that "fared out well" on graphics/UX — see `reference/OTHER_PROJECT_CLAUDE.md` and `reference/OTHER_PROJECT_SYSTEM_MEMORY.md`. Those are read-only reference material for this project, copied in from elsewhere — **never edit them**; they're not this project's own memory.
- Wants to build in stages: base scaffold first, working proof of concept next, then refine/expand (richer template editor, more polish) once the core loop is proven.
- Cares about visual/UX craft (confirmed by the reference project's emphasis on theming, accessibility, mascot personality) — expect that bar to rise once we're past the bare-bones stage.

## Tooling and Graphics Direction (carried over from the other project)

The other project's `reference/OTHER_PROJECT_SYSTEM_MEMORY.md` describes what worked well there. Worth reusing here as the visual system matures, but NOT built yet at this stage — only the plain scaffold exists so far:

- Next.js (App Router) + TypeScript + Tailwind CSS, custom CSS variables for theme tokens rather than literal Tailwind color classes, once a real design system starts.
- Light + warm dark theme pair; treat accessibility (size, high contrast, reduce motion, colorblind palettes) as independent axes, not bundled toggles — if/when this project grows an accessibility surface.
- `qrcode` npm package is the approved way to generate a scannable link for an RSVP page (installed already, not yet wired into any page).
- Prefer a small shared UI component set (Button/Card/Modal/Input/Toast-equivalent) over ad hoc one-off styling once there's enough surface area to justify it — premature right now with only 3 pages.
- If live-updating anything (e.g. a host-facing guest list that should update as RSVPs come in), prefer WebSocket push over polling, mirroring the other project's stated preference — not needed yet since there's no host dashboard.

Do not copy over anything specific to the other project's own domain (orders, kitchens, admin roles) — only the general tooling/graphics approach applies here.

## Decisions Not to Re-Litigate Casually

- Postgres is the datastore, matching the other project's familiar patterns (`pg` client, no ORM). Local dev expects a reachable `DATABASE_URL` (see `.env.local.example`).
- Template builder starts as a simple form (title/description/date/location + a flat list of text/yes-no questions). No drag-and-drop visual editor, no per-event custom theming yet — that's explicitly deferred until the base flow is proven out.
- Slugs are short random strings (`nanoid`, non-guessable alphabet excluding ambiguous characters), not sequential ids — event links are meant to be shared/public.
- `initDb()` runs idempotent `CREATE TABLE IF NOT EXISTS` migrations on first DB access per process, same memoized-promise pattern as the other project. If the schema changes, everyone hitting the app after a deploy/restart gets migrated automatically — no separate migration runner yet at this stage.

## Update Discipline

Keep this file for narrative reasoning, rejected approaches, and user working-style notes. Put current mechanics (schema, routes, architecture) in `SYSTEM_MEMORY.md`. Update existing bullets instead of growing a chronological diary; skip routine cosmetic changes.

**Only update these two files when the user explicitly asks** (e.g. "log that," "update the docs") — not after every change. Batch whatever's accumulated since the last log into one pass at that point, still following update-existing-bullets discipline rather than appending a dated diary entry.

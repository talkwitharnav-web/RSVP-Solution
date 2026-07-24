# SYSTEM_MEMORY.md

Current technical truth for the RSVP app. Narrative history and working-style notes live in `CLAUDE.md`.

## Stack

- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 — scaffolded via `create-next-app` on 2026-07-23.
- PostgreSQL via `pg` (no ORM), connection via `DATABASE_URL` env var.
- `nanoid` for short public slugs, `qrcode` installed but not yet wired into any page, `lucide-react` for all icons (never emoji — see UI and Design Rules), `ws` for the WebSocket server/client.
- Dev server: `npm run dev` runs `node server.js`, pinned to **port 3001**, not the Next.js default 3000 — the user's other project (restaurant order tracker) already runs on 3000, and both projects may run side by side. `npm run start` also runs `server.js`. All scripts (`scripts/*.sh`, `scripts/*.ps1`) and docs reference 3001.
- **Custom `server.js`** (CJS, project root) wraps Next and hosts a raw `/ws` WebSocket endpoint — required because plain `next dev`/`next start` can't host a raw WS upgrade. Same-origin check on the WS upgrade (Origin header must match Host); no LAN/non-browser exception yet (unlike the reference project, RSVP has no non-browser client). Broadcasts a `{type: "heartbeat", status: "healthy", at: <ms>}` message every 10s to all connected clients (`globalThis.__rsvpWsClients`), plus one immediate heartbeat on connect. `eslint.config.mjs` has a scoped override allowing `require()` in `server.js` only (it's a plain CJS entrypoint, not bundled by Next).

## Environment

- Local Postgres runs via Docker: `docker-compose.yml` defines a single `postgres:16` service, container name `rsvp-postgres-1`, port `5432`, db `rsvp_dev`, user/pass `postgres`/`postgres`, data in the named volume `rsvp-postgres-data`. Start with `docker compose up -d`, matching the other project's Docker-based local Postgres.
- Copy `.env.local.example` to `.env.local` (`DATABASE_URL=postgres://postgres:postgres@localhost:5432/rsvp_dev` — already matches the compose defaults). `.env*` is gitignored.
- `npm run dev` needs the container up first; `initDb()` migrates on first DB access per process, same as the other project.

### One-command start/stop

- `npm run start:all` (or double-click `startup.cmd`, or `scripts/startup.ps1`/`.sh` directly): checks Node/npm/Docker installed, **auto-launches Docker Desktop if it's not running** (waits up to 90s via a real polling-driven progress bar — this also brings up WSL, since Docker Desktop's backend runs on the WSL2 engine, no separate WSL start needed), creates `.env.local`/installs deps if missing, starts Postgres, waits for it to accept connections, then runs `npm run dev`.
- `npm run stop:all` (or `shutdown.cmd`, or `scripts/shutdown.ps1`/`.sh`): stops whatever's listening on port 3001, stops the Postgres container (data preserved, not deleted), **then also fully quits Docker Desktop and runs `wsl --shutdown`** — this affects the whole machine, not just this project, by explicit user request. Real polling-driven progress bars for both steps, not fixed-time animations.
- `npm run db:up` / `npm run db:down` are aliases for `docker compose up -d` / the same full shutdown behavior as `stop:all` (i.e. `db:down` is NOT just "stop the container" — it also quits Docker Desktop + WSL).
- Shared helper code (`wait_progress`/`Show-WaitProgress` progress-bar functions, output-formatting helpers) lives in `scripts/_common.sh` and `scripts/_common.ps1`, sourced/dot-sourced by both startup and shutdown scripts rather than duplicated.
- Full cold-start-to-shutdown-to-cold-start cycle has been live-verified multiple times (bash path and PowerShell path both individually verified, not just assumed equivalent).

## Architecture

### Routes

| Route | Purpose |
|---|---|
| `/` | **Admin gateway page** (`AdminGatewayPage`). Sidebar: RSVP wordmark, then one grouped nav block (RSVP Sender / RSVP Receiver / Access DB — all dud links to `/admin/sender`, `/admin/receiver`, `/admin/db`, which exist as empty stub pages), then Log Out alone at the bottom separated by a spacer + top border. Top-right: the real collapsible `SettingsToggles` pill (UI size, Accessibility menu, theme toggle, live `HealthPin`). This is the canonical root — not the old create-flow landing page. |
| `/admin` | Redirects (307) to `/`. |
| `/admin/sender`, `/admin/receiver`, `/admin/db` | Empty stub pages (`return null`) — routes exist so the sidebar links resolve, no content yet. |
| `/create/link` | Form to create a "bring your own link" event. No longer linked from `/` since `/` became the admin gateway — still a live route, just currently orphaned (nothing links to it). |
| `/create/template` | Form to create a "hosted template" event, including ad hoc extra questions. Same orphaned-but-live status as `/create/link`. |
| `/e/[slug]` | Public event page. Renders host-provided details; either an outbound "RSVP now" link (external_link) or the hosted `RsvpForm` (hosted_template) |
| `POST /api/events` | Create an event (either kind); returns `{ slug }` |
| `GET /api/events/[slug]` | Fetch one event by slug |
| `POST /api/events/[slug]/rsvps` | Submit a guest RSVP against an event |

**Open question:** `/create/link` and `/create/template` have no inbound link anywhere now that `/` is the admin gateway. Likely destination is somewhere under the future "RSVP Sender" flow, but that hasn't been decided — see `CLAUDE.md`.

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

## UI and Design Rules

- Theme is implemented per `theme.md` (full research/rationale/token table lives there). Fonts: Bricolage Grotesque (`--font-display`, headings only) + Plus Jakarta Sans (`--font-body`, everything else), loaded via `next/font/google` in `layout.tsx`. Colors: full light/dark CSS variable set in `globals.css` — `--color-bg-base`/`-bg-raised`, `--color-text-primary`/`-muted`, `--color-accent-coral`/`-coral-text`/`-on-coral`, `--color-accent-sage`, `--color-accent-lavender`, `--color-border`, `--color-danger`, plus a structural layer added 2026-07-24: `--radius-sm`/`-md`/`-full`, `--color-surface-0`/`-1`/`-2`, `--color-border-strong`, `--color-success` (radius values ported directly from the reference project since they're theme-neutral; surface/border-strong/success derived from our own palette). Theme switches via a manual `data-theme` attribute on `<html>` (set by `ThemeToggle`, applied pre-hydration by an inline script in `layout.tsx` — same mechanism as the reference project) with `prefers-color-scheme` as the fallback when no manual choice has been made yet.
- **Icons are always `lucide-react`, never emoji.** Emoji was tried first on the admin page and explicitly rejected by the user (2026-07-23) — emoji ignore theme color tokens and read as low-effort next to a real icon set.
- CSS custom properties (`--color-*`), never literal Tailwind color utility classes in components — same convention as the reference project.
- **Real accessibility system, ported from the reference project's actual source** (not just its docs) on 2026-07-24: `AccessibilityMenu` dropdown with three independent boolean toggles (High Contrast → `[data-contrast="high"]`, Reduce Motion → `[data-motion="reduced"]`, Enhanced Focus Outline → `[data-focus="enhanced"]`) plus a colorblind-palette radio group (`[data-cvd="deuteranopia"|"protanopia"|"tritanopia"]`, swaps the coral/sage/lavender accent hues). Persisted via localStorage + data-attributes, same pre-hydration-script pattern as theme. `src/lib/accessibility-prefs.ts` is the get/set contract.
- **Real collapsible Settings pill** (`SettingsToggles.tsx`), not a static pill — collapses to a single Settings-icon square (fixed `2.5rem` width; leaving width unset let the pill's own border collapse toward zero-width, where left/right border edges visually merged into a stray line — fixed 2026-07-24), unravels leftward on click to a measured width (`ResizeObserver`-driven, via `useReservedTopRight`) revealing `HealthPin` → UI size (S/M/B) → `AccessibilityMenu` → `ThemeToggle`. Supporting hooks: `useDropdownReveal` (mount/unmount lifecycle for hover/click popovers so a closing animation can play), `useReservedTopRight` (publishes the pill's real measured size as CSS vars so in-flow content, e.g. `PageHeader`, can reserve clearance via the `.clear-top-right` class).
- Small reusable primitives ported/reskinned from the reference project: `Button`, `Card`, `PageHeader`, `ThemedTooltip` (hover tooltip driven by React state, not the native `title` attribute).
- Several `react-hooks/set-state-in-effect` ESLint findings are intentionally suppressed (with inline comments explaining why) in `ThemeToggle`, `UiSizeToggle`, `AccessibilityMenu`, `useDropdownReveal`, `HealthPin` — each is syncing to real DOM/localStorage state on mount (unavoidable without diverging from SSR) or an external system tick, matching the reference project's own documented precedent for the identical pattern. Not blanket-disabled — each site has its own comment.

## Current State / What's Built

As of 2026-07-23:

- **`/` is the admin gateway page** (`src/app/page.tsx`, `AdminGatewayPage`) — sidebar (RSVP wordmark, RSVP Sender/RSVP Receiver/Access DB nav links, Log Out), header with a combined Healthy-status + theme-toggle pill (no divider line under it). All three nav links and both header buttons are visual-only duds — no click behavior wired up yet. Verified visually via headless Chrome (see Chrome-automation rule in `CLAUDE.md`), not just HTTP status — icon alignment (wordmark icon vs. nav icons, all sized `h-4 w-4` sharing the same `px-3` left inset) was specifically checked and fixed after an initial misalignment.
- `/admin` redirects (307) to `/`.
- Both create flows (`/create/link`, `/create/template`) are functional client forms posting to `POST /api/events`, redirecting to `/e/[slug]` on success — currently orphaned (no page links to them since `/` changed).
- `/e/[slug]` renders correctly for both event kinds; the hosted RSVP form (`RsvpForm.tsx`) posts to `POST /api/events/[slug]/rsvps` and shows a plain confirmation message on success.
- `npx tsc --noEmit` and `npx eslint .` both pass clean as of the latest change.
- Full DB-backed loop verified live against real Postgres (Docker) on 2026-07-23: created a `hosted_template` event via `POST /api/events`, loaded `/e/[slug]` (200), submitted an RSVP via `POST /api/events/[slug]/rsvps`, confirmed both rows landed correctly via `psql` (including `answers` JSONB round-tripping). Test rows were deleted afterward.
- `theme.md` written 2026-07-23: full research-backed color/typography decision record (not just vibes) — see that file for the WCAG-contrast-verified token table and rejected directions.

## Explicitly NOT built yet

- Sidebar nav links (`/admin/sender`, `/admin/receiver`, `/admin/db`) and header buttons (Log Out, theme toggle) on `/` are all visual duds — no routes exist at those paths yet, no click handlers.
- No host-facing dashboard/guest list view (a host currently has no way to see who RSVP'd — only the DB holds that).
- No auth of any kind — anyone with an event's slug can view it; anyone can submit an RSVP. No spam/rate-limiting.
- No visual template customization (colors, images, layout) — template events all render through one fixed layout.
- No QR code generation on the event page yet, despite the package being installed.
- No manual theme toggle — dark/light currently follows `prefers-color-scheme` only.
- No tests.
- No production deployment/hosting decision made.

## Next Likely Steps (not started)

- Build out real pages at `/admin/sender`, `/admin/receiver`, `/admin/db` to replace the current dud links.
- Decide where `/create/link` and `/create/template` should be reachable from now that `/` is the admin gateway (see "Open question" under Routes above) — likely folded into the future RSVP Sender flow.
- Add a minimal host view (e.g. `/e/[slug]/manage` or similar) to see submitted RSVPs — needed before this is genuinely useful to a real host, even at proof-of-concept level.
- Wire up `qrcode` on the event page for easy sharing.
- Wire up the theme-toggle button (currently a dud) to a real manual override, same shape as the reference project's toggle.

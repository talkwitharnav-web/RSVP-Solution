# SYSTEM_MEMORY.md

Current technical truth for the RSVP app. Narrative history and working-style notes live in `CLAUDE.md`.

## Stack

- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 — scaffolded via `create-next-app` on 2026-07-23.
- PostgreSQL via `pg` (no ORM), connection via `DATABASE_URL` env var.
- `nanoid` for short public slugs, `qrcode` installed but not yet wired into any page, `lucide-react` for all icons (never emoji — see UI and Design Rules), `ws` for the WebSocket server/client, `bcryptjs` for hashing user passwords (pure-JS, chosen over native `bcrypt` to avoid Windows build friction).
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
| `/` | **Admin gateway page** (`AdminGatewayPage`). Sidebar: RSVP wordmark, then one grouped nav block (RSVP Sender / RSVP Receiver / Access DB), then Log Out alone at the bottom separated by a spacer + top border. Top-right: the real collapsible `SettingsToggles` pill (UI size, Accessibility menu, theme toggle, live `HealthPin`). This is the canonical root — not the old create-flow landing page. |
| `/admin` | Redirects (307) to `/`. |
| `/sender`, `/receiver` | Empty stub pages (`return null`) — standalone top-level routes, **not** under `/admin/*`. Originally built at `/admin/sender`/`/admin/receiver`, moved 2026-07-24: Sender/Receiver are general-purpose audience links (a host, a guest), not admin-gated tools, so nesting them under `/admin` was structurally wrong even though the stub had no content yet either way. |
| `/admin/db` | **Real page**, not a stub (built 2026-07-24) — see "Access DB page" below. |
| `/create/link` | Form to create a "bring your own link" event. No longer linked from `/` since `/` became the admin gateway — still a live route, just currently orphaned (nothing links to it). |
| `/create/template` | Form to create a "hosted template" event, including ad hoc extra questions. Same orphaned-but-live status as `/create/link`. |
| `/e/[slug]` | Public event page. Renders host-provided details; either an outbound "RSVP now" link (external_link) or the hosted `RsvpForm` (hosted_template) |
| `POST /api/events` | Create an event (either kind); returns `{ slug }` |
| `GET /api/events/[slug]` | Fetch one event by slug |
| `DELETE /api/events/[slug]` | Delete an event (added 2026-07-24 for Access DB's RSVP Links table) |
| `POST /api/events/[slug]/rsvps` | Submit a guest RSVP against an event |
| `GET /api/dev/db` | Returns `{ users, events }` — flat, unpaginated (added 2026-07-24 for Access DB) |
| `POST /api/dev/db` | `{ action: "seed" }` — clears all data, inserts 3 sample users + 3 sample events |
| `DELETE /api/dev/db` | `{ confirmation: "PURGE DATABASE" }` — clears `rsvps`, `events`, `users` |
| `PUT /api/users/[id]` | `{ name, username }` — rename a user |
| `DELETE /api/users/[id]` | Delete a user (hard delete, no undelete) |
| `PUT /api/users/[id]/password` | `{ newPassword }` — reset a user's password (bcrypt-hashed + a `raw_password` dev mirror) |
| `GET /api/health` | DB latency (`SELECT 1` round-trip), DB size (`pg_database_size`), connection-pool stats (total/idle/waiting), live WS listener count. No auth gate — see Access DB page notes. |

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

**`users`** (added 2026-07-24 for Access DB — see below)
- `id UUID PK`, `name TEXT NOT NULL`, `username TEXT UNIQUE NOT NULL`
- `password TEXT NOT NULL` — bcrypt-hashed
- `raw_password TEXT` — dev-only plaintext mirror, same intentional technical-debt pattern as the reference project's `restaurants` table
- `created_at TIMESTAMPTZ DEFAULT now()`
- Standalone table, not yet wired to `events` (no `created_by` FK) — these are RSVP host accounts, but events aren't yet tied to a creating user. That link is future work once real host login exists on `/create/*`.

Types mirrored in TypeScript at `src/lib/types.ts` (`EventRecord`, `RsvpRecord`, `EventKind`, `RsvpQuestion`, `UserRecord`).

## Access DB page (`/admin/db`)

Built 2026-07-24, modeled structurally on the reference project's own `admin/db` page (tables, search boxes, type-to-confirm destructive-action modal, shift-click-to-skip-confirm deletes) but retargeted to RSVP's actual data and re-themed to RSVP's fonts/colors/icons — not a copy of the reference's Bistro Glaze toast styling or its restaurant/order/staff domain.

- **Users table**: name, username, hashed password, raw password (dev mirror), with rename / reset-password / delete actions. This is the first piece of a real host-accounts system — no login page or session system exists yet to actually use these credentials.
- **RSVP Links table**: existing `events`, showing each one's real `/e/[slug]` guest link (copyable via `CopyableValue`), kind badge (`external_link`/`hosted_template`), created date, delete.
- Seed / Purge buttons, same type-to-confirm `Modal` pattern as the reference.
- **No auth gate** on the page or its API routes — matches the fact that `/` itself has no login system yet either. Future work, not a silent oversight.
- New UI primitives ported from the reference and re-themed to RSVP's tokens: `Input`, `Modal`/`ModalActions`, `Toast`/`ToastProvider` (simplified — no error-code chip system, no Bistro Glaze gradient/blur, just solid `--color-success`/`-danger`/`-accent-coral` fills), `CopyableValue`, `StrengthMeter` (with `src/lib/credential-strength.ts` for live password-strength scoring). Supporting CSS keyframes (`modal-backdrop-in/out`, `modal-panel-in/out`, `notification-pop-in/out`) added to `globals.css`, all covered by the existing blanket `[data-motion="reduced"] *` override.
- Deliberately not ported: Staff page/button, per-order status workflow, kitchen-specific duration-tracking cells, `useWindowedOrders`-style keyset pagination (RSVP's data volume doesn't need it — `GET /api/dev/db` returns everything flat).

## WebSockets

- `src/lib/useWebSocket.ts` — reusable client hook (connect to `/ws`, JSON message parsing, reconnect with exponential backoff capped at 15s, returns `{status, messagesByType}` keyed by each message's own `type`). Not hardcoded to health data — a future live feature (e.g. a host dashboard watching RSVP counts) can subscribe to its own message type over the same connection instead of opening a second socket. Currently unused directly (see `HealthPin` below) but deliberately kept, not dead code.
- `HealthPin` (`src/components/ui/HealthPin.tsx`) was rebuilt 2026-07-24 as a real port of the reference project's own `HealthPin` — polls `GET /api/health` (not WS-heartbeat-driven anymore) for DB round-trip latency, DB size, connection-pool stats, live WS listener count (still read from `globalThis.__rsvpWsClients`, just via the HTTP endpoint now), plus the client's own round-trip time to the server. Same tiering (`healthy`/`ok`/`bad`/`terrible`), same poll cadence (10s idle / 1.5s while the popover is open), same hover/tap popover UI. Only intentional differences from the reference: no admin-vs-kitchen auth gating (RSVP has no login system, so nothing is hidden) and no audit-log size stat (RSVP has no audit table). `showDbSize` prop (opt-in, passed from `/admin/db` only) inlines the DB's on-disk size next to the status dot.
- No other real-time data flows over the socket yet.

## UI and Design Rules

- Theme is implemented per `theme.md` (full research/rationale/token table lives there). Fonts: Bricolage Grotesque (`--font-display`, headings only) + Plus Jakarta Sans (`--font-body`, everything else), loaded via `next/font/google` in `layout.tsx`. Colors: full light/dark CSS variable set in `globals.css` — `--color-bg-base`/`-bg-raised`, `--color-text-primary`/`-muted`, `--color-accent-coral`/`-coral-text`/`-on-coral`, `--color-accent-sage`, `--color-accent-lavender`, `--color-border`, `--color-danger`, plus a structural layer added 2026-07-24: `--radius-sm`/`-md`/`-full`, `--color-surface-0`/`-1`/`-2`, `--color-border-strong`, `--color-success` (radius values ported directly from the reference project since they're theme-neutral; surface/border-strong/success derived from our own palette). Theme switches via a manual `data-theme` attribute on `<html>` (set by `ThemeToggle`, applied pre-hydration by an inline script in `layout.tsx` — same mechanism as the reference project) with `prefers-color-scheme` as the fallback when no manual choice has been made yet.
- **Icons are always `lucide-react`, never emoji.** Emoji was tried first on the admin page and explicitly rejected by the user (2026-07-23) — emoji ignore theme color tokens and read as low-effort next to a real icon set.
- CSS custom properties (`--color-*`), never literal Tailwind color utility classes in components — same convention as the reference project.
- **Real accessibility system, ported from the reference project's actual source** (not just its docs) on 2026-07-24: `AccessibilityMenu` dropdown with three independent boolean toggles (High Contrast → `[data-contrast="high"]`, Reduce Motion → `[data-motion="reduced"]`, Enhanced Focus Outline → `[data-focus="enhanced"]`) plus a colorblind-palette radio group (`[data-cvd="deuteranopia"|"protanopia"|"tritanopia"]`, swaps the coral/sage/lavender accent hues). Persisted via localStorage + data-attributes, same pre-hydration-script pattern as theme. `src/lib/accessibility-prefs.ts` is the get/set contract.
- **High contrast / CVD palette specificity bug fixed 2026-07-24**: `[data-contrast="high"]` and `[data-cvd="..."]` (specificity 0,1,0) were silently losing the CSS cascade to `:root[data-theme="dark"]` (specificity 0,1,1) whenever dark mode was active — which it is by default (`prefers-color-scheme` fallback). Found via headless-Chrome computed-style inspection (`getComputedStyle(...).getPropertyValue('--color-...')` before/after toggling the attribute), not just visual screenshot comparison, since the visual delta was subtle enough to miss by eye. Fixed by anchoring both selectors to `:root` (`:root[data-contrast="high"]`, `:root[data-cvd="..."]`) to match the theme rule's specificity.
- **Real collapsible Settings pill** (`SettingsToggles.tsx`), not a static pill — collapses to a single Settings-icon square (fixed `2.5rem` width; leaving width unset let the pill's own border collapse toward zero-width, where left/right border edges visually merged into a stray line — fixed 2026-07-24), unravels leftward on click to a measured width (`ResizeObserver`-driven, via `useReservedTopRight`) revealing `HealthPin` → UI size (S/M/B) → `AccessibilityMenu` → `ThemeToggle`. Supporting hooks: `useDropdownReveal` (mount/unmount lifecycle for hover/click popovers so a closing animation can play), `useReservedTopRight` (publishes the pill's real measured size as CSS vars so in-flow content, e.g. `PageHeader`, can reserve clearance via the `.clear-top-right` class).
- **`PageHeader` gained a `noClearTopRight` opt-out prop 2026-07-24**, used by `/admin/db` only. The pill is a `fixed` overlay — it should draw on top of other UI when it expands, not have other UI live-shift to avoid it. `clear-top-right`'s reserved-space padding is driven by a CSS var that updates as the pill expands/collapses, which on `/admin/db` (a header with a busy action row: Seed/Purge/Back) was visibly shoving the action buttons left in real time. Fixed by having that page opt out of `clear-top-right` entirely and instead give its one genuinely crowded button (Purge Database) a small **static** `mr-14` margin — just enough clearance from the pill's *collapsed* resting position, that doesn't grow/shrink as the pill opens. The transient hover/tap health-detail popover still briefly overlaps the header when open — treated as acceptable, same category as any tooltip/dropdown overlapping content while open, not a persistent layout issue.
- Small reusable primitives ported/reskinned from the reference project: `Button`, `Card`, `PageHeader`, `ThemedTooltip` (hover tooltip driven by React state, not the native `title` attribute).
- Several `react-hooks/set-state-in-effect` ESLint findings are intentionally suppressed (with inline comments explaining why) in `ThemeToggle`, `UiSizeToggle`, `AccessibilityMenu`, `useDropdownReveal`, `HealthPin` — each is syncing to real DOM/localStorage state on mount (unavoidable without diverging from SSR) or an external system tick, matching the reference project's own documented precedent for the identical pattern. Not blanket-disabled — each site has its own comment.
- **Tailwind v4's Preflight resets `button { cursor: default }`** (an intentional upstream accessibility-motivated change from earlier Tailwind versions) — every native `<button>` in this app was showing the plain arrow cursor instead of the pointer/"clicky" cursor on hover until this was caught and fixed 2026-07-24. Fixed globally in `globals.css` with `button:not(:disabled), [role="button"] { cursor: pointer; }` rather than patching each component's className individually. If a future button still shows the wrong cursor, check whether it's disabled (correctly gets `cursor-not-allowed` instead, see `Button.tsx`) before assuming the global rule broke.

## Current State / What's Built

As of 2026-07-24:

- **`/` is the admin gateway page** (`src/app/page.tsx`, `AdminGatewayPage`), fully overhauled from the 2026-07-23 static version by exploring the reference project's real source directly (not just its docs). Sidebar nav: RSVP Sender (`/sender`) and RSVP Receiver (`/receiver`) are standalone top-level stub pages (moved off `/admin/*` this same day — see Routes table); Access DB (`/admin/db`) is a real, working page. The surrounding chrome (Settings pill, HealthPin, Accessibility menu, theme toggle, UI size toggle) is real, working functionality, not placeholders.
- `/admin` redirects (307) to `/`.
- **`/admin/db` (Access DB) is a real page**, not a stub — Users + RSVP Links tables, seed/purge, search, rename/reset-password/delete. See "Access DB page" above.
- **`/api/health` is real** — DB latency/size/pool stats, live WS listener count. `HealthPin` polls it directly (no longer WS-heartbeat-only).
- Both create flows (`/create/link`, `/create/template`) still functional but orphaned (no page links to them).
- `/e/[slug]` and the hosted RSVP form still working as of the 2026-07-23 DB-backed verification.
- `npx tsc --noEmit` and `npx eslint .` both pass clean as of the latest change.
- `theme.md` (2026-07-23): research-backed color/typography decision record — see that file for the WCAG-contrast-verified token table.
- **Sidebar layout fixed 2026-07-24**: Access DB originally sat directly adjacent to Log Out (separated only by a thin divider), which the user flagged as an overshoot-misclick risk ("what if someone goes to click access db but they overshoot and click log out?"). Fixed to match the reference project's actual grouping — Access DB joined the Sender/Receiver block, Log Out pushed to the bottom via a flex spacer with its own top border, real vertical distance between them.

## Explicitly NOT built yet

- No actual content behind `/sender`, `/receiver` — empty stub pages.
- No login/session system anywhere in the app — `users` table exists (Access DB) but nothing authenticates against it yet; `/admin/db` and its API routes have no auth gate; Log Out button has no click handler.
- `users` isn't yet linked to `events` (no `created_by` FK) — a host account and the events it creates aren't connected yet.
- No host-facing dashboard/guest list view (a host currently has no way to see who RSVP'd — only the DB holds that, viewable via Access DB).
- No auth of any kind on guest-facing routes — anyone with an event's slug can view it; anyone can submit an RSVP. No spam/rate-limiting.
- No visual template customization (colors, images, layout) — template events all render through one fixed layout.
- No QR code generation on the event page yet, despite the package being installed.
- No tests.
- No production deployment/hosting decision made.

## Next Likely Steps (not started)

- Build out real pages at `/sender`, `/receiver`.
- Add a real login/session system so the `users` table (Access DB) actually authenticates hosts, and gate `/admin/db` behind it.
- Link `users` to `events` (a `created_by` FK) so a host account owns the events it creates.
- Decide where `/create/link` and `/create/template` should be reachable from now that `/` is the admin gateway — likely folded into the future RSVP Sender flow.
- Add a minimal host view (e.g. `/e/[slug]/manage` or similar) to see submitted RSVPs.
- Wire up `qrcode` on the event page for easy sharing.
- If a real host dashboard is ever built with live-updating data, it should subscribe to its own message `type` over the existing `useWebSocket` connection rather than opening a second socket.

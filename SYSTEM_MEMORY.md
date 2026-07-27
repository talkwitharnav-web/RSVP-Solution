# SYSTEM_MEMORY.md

Current technical truth for the RSVP app. Narrative history and working-style notes live in `CLAUDE.md`.

## Stack

- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 — scaffolded via `create-next-app` on 2026-07-23.
- PostgreSQL via `pg` (no ORM), connection via `DATABASE_URL` env var.
- `nanoid` for short public slugs, `qrcode` installed but not yet wired into any page, `lucide-react` for all icons (never emoji — see UI and Design Rules), `ws` for the WebSocket server/client, `bcryptjs` for hashing user passwords (pure-JS, chosen over native `bcrypt` to avoid Windows build friction).
- Dev server: `npm run dev` runs `node server.js`, pinned to **port 3001**, not the Next.js default 3000 — the user's other project (restaurant order tracker) already runs on 3000, and both projects may run side by side. `npm run start` also runs `server.js`. All scripts (`scripts/*.sh`, `scripts/*.ps1`) and docs reference 3001.
- **Custom `server.js`** (CJS, project root) wraps Next and hosts a raw `/ws` WebSocket endpoint — required because plain `next dev`/`next start` can't host a raw WS upgrade. Same-origin check on the WS upgrade (Origin header must match Host); no LAN/non-browser exception yet (unlike the reference project, RSVP has no non-browser client). Broadcasts a `{type: "heartbeat", status: "healthy", at: <ms>}` message every 10s to all connected clients (`globalThis.__rsvpWsClients`), plus one immediate heartbeat on connect. Also exposes its own `broadcast()` function on `globalThis.__rsvpBroadcast` (added 2026-07-24) so API route handlers — which run in the same Node process but through Next's request handler, not `server.js`'s own code — can push a live WS message without holding a WebSocket client themselves; see "Auth" and "WebSockets" sections below. `eslint.config.mjs` has a scoped override allowing `require()` in `server.js` only (it's a plain CJS entrypoint, not bundled by Next).
  - **Gotcha**: `server.js` only runs its top-level code once at process boot — it is not hot-reloaded by Next's dev-mode HMR. Editing `server.js` (e.g. adding the `__rsvpBroadcast` assignment) requires a full dev-server restart before API routes can see the new `globalThis` value; a plain file save is not enough. Confirmed via a `hasBroadcastFn: false` → restart → `hasBroadcastFn: true` check on 2026-07-24.

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
- **Docker Desktop shutdown fixed to be graceful (2026-07-27)**: both `shutdown.ps1`/`shutdown.sh` previously hard-killed Docker Desktop (`Stop-Process -Force` / `taskkill /F`) — a forceful kill equivalent to SIGKILL, which skips Docker Desktop's own teardown of its WSL-hosted backend. That's why `vmmemWSL` was still showing as a running process in Task Manager even after the script finished — the backend never got the chance to tell WSL it was done before the subsequent `wsl --shutdown` call ran, so there was nothing clean left for it to shut down. Fixed by using `docker desktop stop --timeout 30` (a real Docker Desktop CLI plugin subcommand, confirmed present via `docker desktop --help` — synchronous by default, no `-d`/`--detach`) as the primary path, with the old force-kill kept only as a fallback if the `docker` CLI isn't found or the graceful stop reports an error. **Deliberately no `--force` flag** on the CLI call — that flag exists specifically to skip the same graceful path this fix was restoring. Live-verified 2026-07-27: ran the fixed script, confirmed `Get-Process -Name "vmmemWSL"` returned nothing and `wsl --list --running` reported no running distributions, then brought everything back up via `startup.ps1` to restore the pre-test state.

## Architecture

### Routes

| Route | Purpose |
|---|---|
| `/` | **Admin gateway page** (`AdminGatewayPage`). Sidebar: RSVP wordmark, then one grouped nav block (RSVP Sender / RSVP Receiver / Access DB — Access DB only rendered once an admin session exists), then Log Out alone at the bottom separated by a spacer + top border (only rendered when logged in). Top-right: the real collapsible `SettingsToggles` pill (UI size, Accessibility menu, theme toggle, live `HealthPin`, `HealthPin` itself only rendered when logged in). When logged out, the main content area shows an inline `AuthCard` admin login form instead of a nav destination — see "Auth" below. This is the canonical root — not the old create-flow landing page. |
| `/admin` | Redirects (307) to `/`. |
| `/sender` | Gated stub page — redirects to `/sender/login` if no sender session, otherwise shows a minimal "Signed in as X" placeholder (the real dashboard isn't built yet). |
| `/sender/login` | Sender login form (username/password/Remember Me). If zero `users` rows exist in the DB, redirects straight to `/sender/signup` before rendering — see "Auth" below. If a valid sender session already exists, redirects to `/sender`. |
| `/sender/signup` | Sender self-serve signup form (name/username/password with a live `StrengthMeter`/Remember Me). Auto-logs-in on success. |
| `/receiver` | Empty stub page (`return null`) — standalone top-level route, **not** under `/admin/*`. |
| `/admin/db` | **Real page**, gated behind a valid admin session (built 2026-07-24, gated 2026-07-24) — see "Access DB page" below. |
| `/create/link` | Form to create a "bring your own link" event. No longer linked from `/` since `/` became the admin gateway — still a live route, just currently orphaned (nothing links to it). |
| `/create/template` | Form to create a "hosted template" event, including ad hoc extra questions. Same orphaned-but-live status as `/create/link`. |
| `/e/[slug]` | Public event page. Renders host-provided details; either an outbound "RSVP now" link (external_link) or the hosted `RsvpForm` (hosted_template) |
| `POST /api/admin/login` | `{ username, password, rememberMe }` — hardcoded admin credential check (see "Auth"), sets `admin_session` cookie |
| `POST /api/sender/login` | `{ username, password, rememberMe }` — bcrypt-checked against `users`, sets `sender_session` cookie. Runs `bcrypt.compare` against a fixed dummy hash even when the username doesn't exist, so "no such user" and "wrong password" take the same wall-clock time. |
| `POST /api/sender/register` | `{ name, username, password, rememberMe }` — creates a `users` row (bcrypt-hashed + `raw_password` dev mirror), auto-logs-in on success, broadcasts `db-changed` (kind `users`) |
| `GET /api/sender/has-account` | `{ hasAccount: boolean }` — whether any `users` row exists at all; drives `/sender/login`'s forced-signup redirect |
| `GET /api/session` | `{ authenticated, admin, sender: { username } | null }` — reads both the `admin_session` and `sender_session` cookies independently; both can be valid at once in the same browser |
| `POST /api/logout` | `{ type: "admin" | "sender" }` (or omitted, clears both) — clears the relevant session cookie via `maxAge: 0` |
| `POST /api/events` | Create an event (either kind); returns `{ slug }`; broadcasts `db-changed` (kind `events`) |
| `GET /api/events/[slug]` | Fetch one event by slug — no auth gate, public (used by `/e/[slug]`) |
| `DELETE /api/events/[slug]` | Delete an event (added 2026-07-24 for Access DB's RSVP Links table); **admin-gated** (2026-07-24); broadcasts `db-changed` (kind `events`) |
| `POST /api/events/[slug]/rsvps` | Submit a guest RSVP against an event |
| `GET /api/dev/db` | Returns `{ users, events }` — flat, unpaginated; **admin-gated** (2026-07-24) |
| `POST /api/dev/db` | `{ action: "seed" }` — clears all data, inserts 3 sample users + 3 sample events; **admin-gated**; broadcasts `db-changed` for both kinds |
| `DELETE /api/dev/db` | `{ confirmation: "PURGE DATABASE" }` — clears `rsvps`, `events`, `users`; **admin-gated**; broadcasts `db-changed` for both kinds |
| `PUT /api/users/[id]` | `{ name, username }` — rename a user; **admin-gated**; broadcasts `db-changed` (kind `users`) |
| `DELETE /api/users/[id]` | Delete a user (hard delete, no undelete); **admin-gated**; broadcasts `db-changed` (kind `users`) |
| `PUT /api/users/[id]/password` | `{ newPassword }` — reset a user's password (bcrypt-hashed + a `raw_password` dev mirror); **admin-gated**; broadcasts `db-changed` (kind `users`) |
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

## Auth

Added 2026-07-24. Two independent, unrelated auth systems — ported from the reference project's own admin/kitchen split (admin credentials are recorded in `CLAUDE.md`'s "Critical — Read First" section):

- **Admin** — a single hardcoded username/password pair checked in `POST /api/admin/login` (plaintext string comparison, no DB row, no bcrypt — matches the reference project's own pre-public-launch tech debt, flagged as the first thing to move to env vars before any non-local deployment). The login form itself is inline on `/` (`AuthCard` in the gateway page's main content area when no admin session exists), not a separate `/admin/login` route — matches the reference project's own layout exactly, per explicit user instruction ("in the empty space on the right of the sidebar, it will have a login window like how restaurant has it").
- **Sender** — real, DB-backed, self-serve. `/sender/login` checks `GET /api/sender/has-account` first; if the `users` table is empty, it redirects straight to `/sender/signup` before ever rendering a login card (so a fresh install can't dead-end at a login form with nothing to log into). `/sender/signup` is a real self-serve registration form (bcrypt-hashed password, `raw_password` dev mirror, live `StrengthMeter`), auto-logs-in on success.

**Session mechanism** (`src/lib/session.ts`, ported from the reference project's own `lib/session.ts`): a stateless, signed HMAC token — `base64url(JSON payload) + "." + HMAC-SHA256(payload)` — not a JWT, not a DB `sessions` table. `verifySessionToken` uses `timingSafeEqual` on the signature and checks the payload's own `exp` claim. `SESSION_SECRET` env var with a dev-only hardcoded fallback (console warning if unset). Two separate cookies (`admin_session`, `sender_session`) so both roles can be logged in independently in the same browser without one login clobbering the other's cookie/remember-me duration — same rationale as the reference project's `admin_session`/`restaurant_session` split.

**Cookie options**: `httpOnly`, `sameSite: "lax"`, `secure` gated on `FORCE_SECURE_COOKIES === "true"` (explicit opt-in, not tied to `NODE_ENV`, since `NODE_ENV` reflects build mode not actual transport). **Remember Me** controls only the cookie's `maxAge` at set-time — 30 days if checked, 1 day if not (a real explicit value, not an omitted-`maxAge` session-only cookie, which the reference project found unreliable across ordinary browser navigation). The signed token's own internal `exp` is always 30 days regardless, an outer safety bound independent of cookie persistence.

**Enforcement layers** (`src/lib/auth.ts`): `requireAdmin()` / `requireSender()` are the real security boundary — every admin-gated API route calls one as its first line and returns its 401 response early if unauthorized. Pages additionally do a client-side `GET /api/session` check + redirect for UX (no flash of protected content), but that's not the actual gate — confirmed via a direct unauthenticated `curl` to `GET /api/dev/db` returning a real 401, not just a client-side bounce.

**Gated behind `requireAdmin()`**: the `/admin/db` page itself (client-side redirect to `/` if no admin session) plus its backing routes — `/api/dev/db` (GET/POST/DELETE), `/api/users/[id]` (PUT/DELETE), `/api/users/[id]/password` (PUT), `/api/events/[slug]` DELETE only (GET stays public, used by `/e/[slug]`).

**Not yet built**: `users` still isn't linked to `events` (no `created_by` FK) — a sender account and the events it creates aren't connected yet, so a signed-in sender has no way to see "their" events specifically. Real Sender dashboard content beyond the "Signed in as X" placeholder.

## Access DB page (`/admin/db`)

Built 2026-07-24, modeled structurally on the reference project's own `admin/db` page (tables, search boxes, type-to-confirm destructive-action modal, shift-click-to-skip-confirm deletes) but retargeted to RSVP's actual data and re-themed to RSVP's fonts/colors/icons — not a copy of the reference's Bistro Glaze toast styling or its restaurant/order/staff domain.

- **Users table**: name, username, hashed password, raw password (dev mirror), with rename / reset-password / delete actions. This is the first piece of a real host-accounts system, now actually authenticated against by `/sender/login` — see "Auth" above.
- **RSVP Links table**: existing `events`, showing each one's real `/e/[slug]` guest link (copyable via `CopyableValue`), kind badge (`external_link`/`hosted_template`), created date, delete.
- Seed / Purge buttons, same type-to-confirm `Modal` pattern as the reference.
- **Admin-gated** (2026-07-24) — both the page (client-side redirect to `/`) and its backing API routes (server-side `requireAdmin()` 401) — see "Auth" above for the mechanism.
- **Live updates via WebSocket** (2026-07-24) — the page subscribes to `useWebSocket()` and refetches (`GET /api/dev/db`) whenever a `db-changed` message arrives, so a user signing up or a link being created/deleted from anywhere (another tab, another device, a direct API call) shows up within about a second with no manual refresh and no polling. See "WebSockets" below for the broadcast mechanism.
- New UI primitives ported from the reference and re-themed to RSVP's tokens: `Input`, `Modal`/`ModalActions`, `Toast`/`ToastProvider` (simplified — no error-code chip system, no Bistro Glaze gradient/blur, just solid `--color-success`/`-danger`/`-accent-coral` fills), `CopyableValue`, `StrengthMeter` (with `src/lib/credential-strength.ts` for live password-strength scoring), `AuthCard`/`Checkbox` (added 2026-07-24 for the admin/sender login and signup forms).
- Deliberately not ported: Staff page/button, per-order status workflow, kitchen-specific duration-tracking cells, `useWindowedOrders`-style keyset pagination (RSVP's data volume doesn't need it — `GET /api/dev/db` returns everything flat).

## WebSockets

- `src/lib/useWebSocket.ts` — reusable client hook (connect to `/ws`, JSON message parsing, reconnect with exponential backoff capped at 15s, returns `{status, messagesByType}` keyed by each message's own `type`). Not hardcoded to health data — any live feature subscribes to its own message `type` over the same connection instead of opening a second socket. First real consumer beyond `HealthPin`'s indirect listener-count use: `/admin/db`'s live-refresh (2026-07-24, see below).
- `HealthPin` (`src/components/ui/HealthPin.tsx`) was rebuilt 2026-07-24 as a real port of the reference project's own `HealthPin` — polls `GET /api/health` (not WS-heartbeat-driven anymore) for DB round-trip latency, DB size, connection-pool stats, live WS listener count (still read from `globalThis.__rsvpWsClients`, just via the HTTP endpoint now), plus the client's own round-trip time to the server. Same tiering (`healthy`/`ok`/`bad`/`terrible`), same poll cadence (10s idle / 1.5s while the popover is open), same hover/tap popover UI, same debounced-250ms immediate-fetch-on-open and tab-visibility-pause gotchas as the reference. Only intentional differences from the reference: no admin-vs-kitchen auth gating (RSVP's admin gate is now real, but `/api/health` itself still isn't gated — matches the reference's own kitchen-facing exposure pattern, not an oversight) and no audit-log size stat (RSVP has no audit table). `showDbSize` prop (opt-in, passed from `/admin/db` only) inlines the DB's on-disk size next to the status dot.
- **`db-changed` broadcast (added 2026-07-24)**: `server.js` exposes its `broadcast()` function on `globalThis.__rsvpBroadcast` (see Stack section's `server.js` note and its restart gotcha). `src/lib/ws-broadcast.ts` wraps it as `broadcastDbChanged(kind: "users" | "events")`, called from every route that inserts/updates/deletes a `users` or `events` row (`/api/sender/register`, `/api/dev/db` POST/DELETE, `/api/users/[id]` PUT/DELETE, `/api/users/[id]/password` PUT, `/api/events` POST, `/api/events/[slug]` DELETE) immediately after the write succeeds. `/admin/db` is the one current subscriber — see its section above. Live-verified 2026-07-24: a signup fired from a separate HTTP connection appeared in the Users table within ~1.5s with no manual refresh, screenshotted before/after in headless Chrome.
- No other real-time data flows over the socket yet.

## UI and Design Rules

- Theme is implemented per `theme.md` (full research/rationale/token table lives there). Fonts: Bricolage Grotesque (`--font-display`, headings only) + Plus Jakarta Sans (`--font-body`, everything else), loaded via `next/font/google` in `layout.tsx`. Colors: full light/dark CSS variable set in `globals.css` — `--color-bg-base`/`-bg-raised`, `--color-text-primary`/`-muted`, `--color-accent-coral`/`-coral-text`/`-on-coral`, `--color-accent-sage`/`-on-sage`, `--color-accent-lavender`/`-on-lavender`, `--color-border`, `--color-danger`, plus a structural layer added 2026-07-24: `--radius-sm`/`-md`/`-full`, `--color-surface-0`/`-1`/`-2`, `--color-border-strong`, `--color-success` (radius values ported directly from the reference project since they're theme-neutral; surface/border-strong/success derived from our own palette). Theme switches via a manual `data-theme` attribute on `<html>` (set by `ThemeToggle`, applied pre-hydration by an inline script in `layout.tsx` — same mechanism as the reference project) with `prefers-color-scheme` as the fallback when no manual choice has been made yet.
- **Color palette corrected 2026-07-24** — see `theme.md`'s "2026-07-24 correction" note for the full before/after table and WCAG math. Short version: the original coral (`#E4633F`/`#B8431F`) was mathematically orange, not coral-pink, and the original backgrounds (`#1E1B19`/`#2A2522` dark, `#FBF6EE` light) were RGB-close enough to the reference project's own warm-brown surfaces that the built UI read as a copy of it. Corrected to a genuine pink-red coral and real saturated hue backgrounds (bright pink-blush light `#FDF2F5`, deep plum/wine dark `#241827`). Sage and lavender were also defined as tokens from day one but never actually referenced by any component — every accent defaulted to coral, which was the real mechanism behind the "everything looks orange" complaint. Now sage drives "on" states (UI size toggle active pill, `AccessibilityMenu`'s toggle-open state and its switches) and lavender drives selection state (`AccessibilityMenu`'s CVD radio group) plus the gateway wordmark and Access DB nav icon; Sender nav icon stays coral, Receiver is sage. New `--color-on-sage`/`--color-on-lavender` tokens were needed because dark mode's lightened sage/lavender fail contrast against plain white text (sage vs. white is only 2.00:1) — they pair with a dark, same-hue-family text color instead, same pattern as the existing `--color-on-coral`.
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

- **`/` is the admin gateway page** (`src/app/page.tsx`, `AdminGatewayPage`), fully overhauled from the 2026-07-23 static version by exploring the reference project's real source directly (not just its docs). Sidebar nav: RSVP Sender (`/sender`) and RSVP Receiver (`/receiver`) are standalone top-level routes (moved off `/admin/*` this same day — see Routes table); Access DB (`/admin/db`) is a real, working page, only shown in the nav once an admin session exists. The surrounding chrome (Settings pill, HealthPin, Accessibility menu, theme toggle, UI size toggle) is real, working functionality, not placeholders. When logged out, the main content area is a real inline admin login `AuthCard`, not a placeholder.
- `/admin` redirects (307) to `/`.
- **`/admin/db` (Access DB) is a real page**, admin-gated, with live WebSocket updates — Users + RSVP Links tables, seed/purge, search, rename/reset-password/delete. See "Access DB page" and "Auth" above.
- **Real auth system, both admin and sender** (built 2026-07-24) — signed-cookie sessions, admin hardcoded credentials, sender self-serve signup/login with forced-signup-when-no-accounts-exist, Remember Me, live-verified end to end in headless Chrome. See "Auth" above.
- **`/sender` redirects to `/sender/login` if not authenticated**, otherwise shows a "Signed in as X" placeholder — the real sender dashboard content isn't built yet.
- **`/api/health` is real** — DB latency/size/pool stats, live WS listener count. `HealthPin` polls it directly (no longer WS-heartbeat-only).
- **Color palette corrected 2026-07-24** — see "UI and Design Rules" above and `theme.md`'s correction note. Coral is now genuinely pink-red, backgrounds carry real saturated hue instead of neutral warm-brown/cream, and sage/lavender are actually used in the built UI.
- Both create flows (`/create/link`, `/create/template`) still functional but orphaned (no page links to them).
- `/e/[slug]` and the hosted RSVP form still working as of the 2026-07-23 DB-backed verification.
- `npx tsc --noEmit` and `npx eslint .` both pass clean as of the latest change.
- `theme.md` (2026-07-23, corrected 2026-07-24): research-backed color/typography decision record — see that file for the WCAG-contrast-verified token table.
- **Sidebar layout fixed 2026-07-24**: Access DB originally sat directly adjacent to Log Out (separated only by a thin divider), which the user flagged as an overshoot-misclick risk ("what if someone goes to click access db but they overshoot and click log out?"). Fixed to match the reference project's actual grouping — Access DB joined the Sender/Receiver block, Log Out pushed to the bottom via a flex spacer with its own top border, real vertical distance between them.

## Explicitly NOT built yet

- No real content behind `/sender` beyond a "Signed in as X" placeholder; `/receiver` is still an empty stub.
- `users` isn't yet linked to `events` (no `created_by` FK) — a sender account and the events it creates aren't connected yet, so a signed-in sender can't see "their" events specifically.
- No host-facing dashboard/guest list view (a host currently has no way to see who RSVP'd — only the DB holds that, viewable via Access DB).
- No auth of any kind on guest-facing routes — anyone with an event's slug can view it; anyone can submit an RSVP. No spam/rate-limiting.
- No visual template customization (colors, images, layout) — template events all render through one fixed layout.
- No QR code generation on the event page yet, despite the package being installed.
- No tests.
- No production deployment/hosting decision made.
- `SESSION_SECRET` and the admin credential pair are still dev-only hardcoded values — see "Auth" above for what needs to move to env vars before any non-local deployment.

## Next Likely Steps (not started)

- Build out real dashboard content at `/sender` (beyond the "Signed in as X" placeholder) and `/receiver`.
- Link `users` to `events` (a `created_by` FK) so a sender account owns the events it creates.
- Decide where `/create/link` and `/create/template` should be reachable from now that `/` is the admin gateway — likely folded into the future RSVP Sender dashboard.
- Add a minimal host view (e.g. `/e/[slug]/manage` or similar) to see submitted RSVPs.
- Wire up `qrcode` on the event page for easy sharing.
- Any further live-updating data (e.g. a host dashboard watching RSVP counts) should subscribe to its own message `type` over the existing `useWebSocket` connection, following the `db-changed` precedent, rather than opening a second socket.

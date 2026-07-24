# CLAUDE.md

Narrative decisions and working style for this RSVP project. Read `SYSTEM_MEMORY.md` first for current architecture/schema/routes; this file explains why settled choices exist and how to work with the user.

## Critical — Read First

- **Never close Docker Desktop or the app's Node/dev-server process as "cleanup" after testing.** Restarting them (stop + start again) is fine when actually needed, but leaving them open at the end of a turn is the default — only the user decides when Docker/Node actually get closed for the session. Stated explicitly 2026-07-24 after a testing session ended with both closed as tidy-up, which the user did not want: "why the hell did you close docker and node? keep those open. never close them." If a test genuinely requires stopping a server (e.g. to test the shutdown script itself, or to free a port for a different test), that's fine — just don't default to closing things down "to leave a clean state" once verification is done.
- **Never blanket-kill Chrome.** The user actively uses their own Chrome browser alongside this work. For any headless/scripted browser check (screenshots, visual verification):
  1. Launch a separate headless instance with a unique `--user-data-dir` and `--remote-debugging-port=9222`, pointed at `about:blank` (not the target URL directly):
     - PowerShell: `& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --remote-debugging-port=9222 --user-data-dir="$env:TEMP\chrome-headless-test-$(Get-Random)" --no-first-run about:blank`
     - Git Bash: `"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --remote-debugging-port=9222 --user-data-dir="/c/Users/$USER/AppData/Local/Temp/chrome-headless-test-$RANDOM" --no-first-run about:blank`
  2. Open tabs via the CDP HTTP endpoint (`PUT http://localhost:9222/json/new?<url>`), then drive/inspect/screenshot over CDP — don't pass the target URL as a launch arg.
  3. When done, stop ONLY that specific PID (find it via `netstat`/`Get-Process` filtered on port 9222 or the scratch profile path — never `taskkill /IM chrome.exe` or any name-based kill) and delete its `--user-data-dir` scratch profile.

## What this project is

An RSVP website. A host creates an RSVP page one of two ways, gets a shareable link, and guests open that link to RSVP:

- **Bring your own link** — host supplies a title + their existing external RSVP URL (Google Form, Partiful, etc). Our page is a thin branded landing page that hands guests off to that link.
- **Build a template here** — host fills in event details and picks a few RSVP questions (attending y/n, guest count, free-text/yes-no questions). We host the actual form and store responses.

Current milestone (2026-07-23): get a working end-to-end proof of concept for both flows — not a polished/customizable product yet. The user explicitly wants to first prove "yeah this CAN work" before expanding scope.

The app has two audiences that will get separate pages: **RSVP Sender** (a host creating/managing an RSVP) and **RSVP Receiver** (a guest RSVPing) — named directly after the reference project's own Kitchen Portal / Customer Tracker split. `/` is now an admin gateway page with dud nav links to both (plus Access DB), built 2026-07-23 as a structural placeholder before either flow gets built out for real.

## The User and Working Style

- Vibe-codes projects; wants plain-English explanations, not jargon-heavy architecture debates. Do the coding and stack-trace interpretation yourself.
- Has another project (a restaurant order tracker) that "fared out well" on graphics/UX — see `reference/OTHER_PROJECT_CLAUDE.md` and `reference/OTHER_PROJECT_SYSTEM_MEMORY.md`. Those are read-only reference material for this project, copied in from elsewhere — **never edit them**; they're not this project's own memory.
- Wants to build in stages: base scaffold first, working proof of concept next, then refine/expand (richer template editor, more polish) once the core loop is proven.
- Cares about visual/UX craft (confirmed by the reference project's emphasis on theming, accessibility, mascot personality) — expect that bar to rise once we're past the bare-bones stage.
- For a large/risky overhaul, wants a written plan reviewed before implementation starts, not implement-then-explain — stated explicitly for the 2026-07-24 admin dashboard overhaul ("plan/implement the overhaul... before implementing run it by me"). Also explicitly asked not to use subagents for that work ("please don't use any agents") — do the exploration/implementation directly.

## Tooling and Graphics Direction (carried over from the other project)

The other project's `reference/OTHER_PROJECT_SYSTEM_MEMORY.md` describes what worked well there. Worth reusing here as the visual system matures, but NOT built yet at this stage — only the plain scaffold exists so far:

- Next.js (App Router) + TypeScript + Tailwind CSS, custom CSS variables for theme tokens rather than literal Tailwind color classes, once a real design system starts.
- Light + warm dark theme pair; treat accessibility (size, high contrast, reduce motion, colorblind palettes) as independent axes, not bundled toggles — if/when this project grows an accessibility surface.
- `qrcode` npm package is the approved way to generate a scannable link for an RSVP page (installed already, not yet wired into any page).
- Prefer a small shared UI component set (Button/Card/Modal/Input/Toast-equivalent) over ad hoc one-off styling once there's enough surface area to justify it — premature right now with only 3 pages.
- If live-updating anything (e.g. a host-facing guest list that should update as RSVPs come in), prefer WebSocket push over polling, mirroring the other project's stated preference — not needed yet since there's no host dashboard.

Do not copy over anything specific to the other project's own domain (orders, kitchens, admin roles) — only the general tooling/graphics approach applies here.

**Theme is now decided and implemented, not just referenced.** `theme.md` (2026-07-23) is this project's own research-backed color/typography decision — explicitly NOT a copy of the reference project's "warm bistro" theme (user was emphatic about this: "no using theme from the reference files please"). Fonts are Bricolage Grotesque + Plus Jakarta Sans (not the reference's Fraunces/Nunito Sans); palette is coral/sage/lavender on warm cream/charcoal (not the reference's own bistro palette). Icons are `lucide-react` (this one IS the same package as the reference project, and the user explicitly confirmed reusing it: "keep it with lucide react. lucide react is on order tracker and it's awesome") — never emoji, which was tried first and rejected as looking low-effort and ignoring theme color tokens.

The admin gateway page layout (sidebar nav + top-right status/settings pill + Log Out) is structurally modeled on the reference project's own admin gateway screenshot the user shared — same layout skeleton, entirely different visual system (colors/fonts/icons) on top of it. Not mobile-responsive by explicit instruction ("we're not focusing on mobile rn").

**RSVP Sender / RSVP Receiver are general-purpose links, not admin-gated items — Access DB is the one actual admin tool.** First pass (2026-07-23) put all three under one undifferentiated "admin" nav without checking against the reference project's real behavior. User corrected this 2026-07-24: in the reference project, Kitchen Portal/Customer Tracker are always-visible top-level links (not behind admin login), and only Access DB/Audit Log/Issue Review appear after admin auth (`navExtra`, conditionally rendered). Confirmed by reading the reference project's actual `src/app/page.tsx` and `GatewaySidebar.tsx` directly, not just its docs — the user pointed at the real `Restaurant` folder specifically for this ("if you do cd .. and then you look around you should find a folder called Restaurant... look at mainly admin dashboard files"). Fixed by making Sender/Receiver + Access DB one grouped nav block (no visual distinction between "general" and "admin" for now, since there's no real admin auth yet anyway), with Log Out kept separate at the bottom.

**2026-07-24 admin dashboard overhaul**: ported real functionality from the reference project's actual source — collapsible measured-width `SettingsToggles` pill, `AccessibilityMenu` (high contrast/reduce motion/enhanced focus + colorblind palette), `UiSizeToggle` (S/M/B), manual `ThemeToggle`, and a WebSocket-driven `HealthPin` (no polling — user was explicit: "no interval polling, that's stupid and inefficient and hammers resources"). Required adding a custom `server.js` (Next alone can't host a raw `/ws` upgrade) — confirmed with the user first that Node.js being a new requirement was fine (it already was, for `npm`/`next` itself). Deliberately did NOT port: admin login/auth, mascot toggles, KitchenClock/Fullscreen/HelpLink, the real DB console table content, or Bistro Glaze's exact blur/opacity values (user called Bistro Glaze "amazing" and wants to develop RSVP's own equivalent "personality" later, just not by copying the exact values now).

**Sidebar Access DB placement fixed 2026-07-24**: originally sat directly next to Log Out (divider only), which the user flagged as an easy overshoot-misclick risk. Access DB now groups with Sender/Receiver; Log Out sits alone at the bottom with a real spacer + border, matching the reference project's actual `actions` vs. `navExtra` separation.

## Decisions Not to Re-Litigate Casually

- Postgres is the datastore, matching the other project's familiar patterns (`pg` client, no ORM). Local dev expects a reachable `DATABASE_URL` (see `.env.local.example`).
- Template builder starts as a simple form (title/description/date/location + a flat list of text/yes-no questions). No drag-and-drop visual editor, no per-event custom theming yet — that's explicitly deferred until the base flow is proven out.
- Slugs are short random strings (`nanoid`, non-guessable alphabet excluding ambiguous characters), not sequential ids — event links are meant to be shared/public.
- `initDb()` runs idempotent `CREATE TABLE IF NOT EXISTS` migrations on first DB access per process, same memoized-promise pattern as the other project. If the schema changes, everyone hitting the app after a deploy/restart gets migrated automatically — no separate migration runner yet at this stage.
- **Dev server runs on port 3001, not Next's default 3000.** The user's other project (restaurant order tracker) already occupies 3000 and both may run side by side ("order tracker uses port 3000, so this should use 3001," 2026-07-23). Applies everywhere: `package.json` scripts, `startup`/`shutdown` scripts, README.
- **`/` is the admin gateway; `/admin` is a redirect to `/`, not the other way around.** User's explicit framing: "localhost:3001 should be the admin page. /admin should redirect to localhost:3001, and if it's like /admin/smthoverhere then that's fine." So `/admin/db`, `/admin/sender` etc. (future real subroutes) live as actual pages under `/admin/*`, but the bare `/admin` path itself is just a redirect, and `/` is canonical — confirmed explicitly over the alternative (`/admin` canonical, `/` redirects) via a direct question.
- **`npm run stop:all` / `db:down` fully quit Docker Desktop and run `wsl --shutdown`, not just stop the Postgres container.** User explicitly wants this as the default behavior (confirmed via direct question, "yes, do it by default") despite it affecting the whole machine, not just this project. `npm run start:all` correspondingly auto-launches Docker Desktop if it's not running (progress bar, up to 90s wait) rather than erroring out — launching Docker Desktop also brings up WSL as a side effect (its backend runs on the WSL2 engine), so no separate WSL-launch step was needed on the startup side, only shutdown needs its own explicit `wsl --shutdown` call.

## Update Discipline

Keep this file for narrative reasoning, rejected approaches, and user working-style notes. Put current mechanics (schema, routes, architecture) in `SYSTEM_MEMORY.md`. Update existing bullets instead of growing a chronological diary; skip routine cosmetic changes.

**Only update these two files when the user explicitly asks** (e.g. "log that," "update the docs") — not after every change. Batch whatever's accumulated since the last log into one pass at that point, still following update-existing-bullets discipline rather than appending a dated diary entry.

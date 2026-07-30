# NEXT_STEPS.md

Handoff for the next session. Updated 2026-07-30, so a fresh conversation can
pick up with nothing lost.

**Read order for a new session:** `SYSTEM_MEMORY.md` (what's true now) →
`CLAUDE.md` (why, and how the user works) → this file (what to do next).
Supporting detail: `security and bug fixes.md`, `custom rsvp card designer.md`,
`theme.md`.

---

## 0. Thirty-second orientation

An RSVP web app. A **sender** (host) creates an invitation and shares a link; a
**receiver** (guest) opens `/receiver/[slug]` and RSVPs. There's also a
localhost-only **admin** console.

Next.js 16 App Router / React 19 / TypeScript / Tailwind v4 / Postgres via raw
`pg` / custom `server.js` for a raw WebSocket / **port 3001** (3000 belongs to
the user's other project).

Three `EventKind`s exist in the type system, but only **two currently have a
creation UI**: `custom_card` (bring-your-own-card) and `designed_template`
(the Fabric.js canvas editor at `/create/design`, with
`/create/design/[slug]` as the permanent edit link) — both reached from
`NewInvitationModal`/`/sender/landing`. `external_link` is confirmed **not
wanted** — its own route was deleted as dead nav, and there's no plan to
rebuild it. `hosted_template` was a fourth kind but was **removed entirely**
2026-07-29 (type, DB constraint, admin label, seed data all gone) after the
user confirmed it wasn't wanted — don't reintroduce it without asking again.

### Getting running

```
npm run start:all          # docker + postgres + dev server, one command
# or, if Postgres is already up:
npm run dev                # http://localhost:3001
```

Admin login is at `/` (localhost only). Requires `ADMIN_USERNAME`/
`ADMIN_PASSWORD` set in `.env.local` — there is no hardcoded fallback (see
`SYSTEM_MEMORY.md`'s "Auth" section for why). Credentials aren't recorded in
the docs — ask the user directly if genuinely needed.

`npm run start:all` ends in **development mode** (`npm run dev`): hot reload,
LAN sender/receiver testing, admin localhost-only. Production is the same app
in optimized mode (`npm run build` + `npm start`), defaults to loopback, requires
`FORCE_SECURE_COOKIES=true`, and expects a trusted HTTPS proxy; admin is still
available through localhost but returns 404 through LAN/public requests.

Always finish with `npx tsc --noEmit` and `npx eslint .` — both currently pass
clean with zero warnings, and the project treats that as an invariant.

---

## 1. State as of this handoff

Everything below is **done and verified against a running app**, not theoretical.

- **Card editor is genuinely capable.** Fonts render, all five colour roles
  are wired, undo/redo, copy/paste/cut/duplicate, layers with filename labels,
  drag-and-drop images, 5 occasion templates, 30 font pairs, 27 icons + 4
  decorations, snapping/alignment/equal-spacing guides, per-character text
  styling, auto-width text boxes, zoom/pan. The user's own read on it as of
  2026-07-29: "pretty polished... for a small scale project like this" — not
  aiming to rival Canva, and not expected to.
- **Invitation gallery is fully live and fully interactive (2026-07-29).** The
  whole card is a real click/keyboard target to the editor, not just a bottom
  strip. Live-refreshes on any `db-changed` (new/edited/deleted cards, RSVP
  count changes) with no manual reload. A sender can now delete a whole
  invitation directly from its card (confirm modal + shift-click to skip),
  not just an admin from Access DB.
- **Stats modal fixes (2026-07-29)**: the empty↔populated layout swap eases
  via CSS instead of snapping/popping; the pie-chart hover tooltip no longer
  flies in from the corner and has a real fade; a `ThemedTooltip`-inside-`Modal`
  bug that inflated the modal's scrollable area on hover is fixed (see
  "Landmines" below — worth reading if touching either component again).
- **Sessions are revocable (2026-07-29).** Signed cookies carry an
  `auth_sessions` UUID checked on every protected/owner-only path. Logout
  revokes that browser; password reset revokes all sender sessions; user
  delete cascades. `SessionWatcher` receives an identifier-free state-change
  push and confirms its own session before redirecting. Copied-cookie replay
  after logout was verified 401.
- **`EventEditor`/`DesignEditor` sync live, but conservatively.** Both pick up
  a live `published` status change from elsewhere without touching any text
  field or the canvas — a deliberate choice so an in-progress edit is never
  silently overwritten by an unrelated live update.
- **Full security remediation + hammer complete (2026-07-29).** Current record
  is `security.md`; `security and bug fixes.md` is the older 2026-07-28 pass.
  Added raw HTTP/WS guards, strict Fabric scene allowlisting, public event
  projection, revocable sessions, proxy trust, security headers, DB isolation,
  quotas/pagination/scoped live refresh, and patched production dependencies.
  Hammer: 800 concurrent reads + 200 malformed requests + exact rate/WS limits,
  then 3,600 production reads; zero request errors/crashes. One proxy WS cap bug
  was found by the hammer and fixed/retested.
- **Current sender limits were introduced by the security pass, not requested
  by the user:** 50 invitations, 100 MiB serialized event storage, 20 creates/
  hour, 120 updates/10 minutes. Gallery fetches 12 cards/page and admin fetches
  100 rows/table/page, but both append through invisible-sentinel infinite
  scroll (no Load more controls). Discuss product policy before changing limits.
- **Infinite scroll + true gallery image laziness (2026-07-30).** Sender preloads
  480px before page end; each admin table preloads 240px before its own scroll
  end; only a spinner appears on slow requests, and connectivity recovery is
  automatic. Sender summaries carry only `card_image_version`; owner-gated
  `/api/sender/events/[slug]/card-image?v=...` returns the bytes lazily with
  private immutable caching. Native `loading="lazy"` + async decode + fade-in.
- **Two dead routes removed (2026-07-29).** `/create/link` and
  `/create/template` are gone outright (confirmed zero references anywhere
  else first).
- **`hosted_template` removed entirely (2026-07-29)**, reversing an earlier
  same-day plan to give it a new creation entry point — the user confirmed
  on reflection it wasn't wanted. Type, DB constraint, admin label, and seed
  data are all gone.
- **`qrcode`/`@types/qrcode` removed (2026-07-29)** — installed since day one,
  never imported anywhere, user saw no use for it in this project.
- **Admin login has no hardcoded fallback anymore (2026-07-29).** The repo
  turned out to be genuinely public, which permanently exposed the original
  committed credential pair in git history. `ADMIN_USERNAME`/`ADMIN_PASSWORD`
  must now be set in `.env.local`, or admin login returns 503. New
  credentials were set directly in `.env.local`, never written to any md
  file. `SESSION_SECRET` was also generated and set the same way.
- **Optimistic UI everywhere it makes sense** (`src/lib/optimistic.ts`) — saves,
  publishes, deletes (RSVP rows **and** whole invitations), renames, and the
  guest's own RSVP submission all land instantly and roll back if the server
  refuses. Deliberately *not* applied to Seed/Purge or to anything that
  redirects to a server-minted slug.
- **macOS-style notification stack**, mounted once in the root layout.
- **Launch correctness/UX pass complete (2026-07-30).** Publish saves the visible editor state, details/style/canvas edits all participate in unsaved-change guards, uploaded-card dates preserve local time, zero-person attending RSVPs are rejected, sender mobile/touch/keyboard behavior is usable, designed guest cards expose accessible/visible event details, long guest text wraps, the RootLayout script warning is fixed, and only the two app fonts preload eagerly.
- **Linux Mint deployment kit complete in the repo.** `sudo bash ./server-setup.sh` installs software and production services; normal work is through `sudo rsvp`. Private Postgres, restricted role, systemd startup/restart, staging updates with rollback, verified nightly backups/restores, temporary Cloudflare preview, SSH-only admin, and permanent-domain finalization are implemented. See `deploy/DEPLOYMENT.md`.

---

## 2. Recommended next steps, in priority order

### A. Install and launch production

1. Commit/push the current launch/deployment checkpoint without sweeping in unrelated dirty files.
2. Get the Linux Mint machine's SSH IP/hostname and normal username.
3. Install from GitHub with `sudo bash ./server-setup.sh`; choose a fresh production database.
4. Run `sudo rsvp preview` and acceptance-test sender/receiver/WebSockets through the temporary Cloudflare URL.
5. Once the domain is active in Cloudflare, run `sudo rsvp domain rsvp.yourdomain.com` and verify public sender/receiver plus public admin 404.
6. Copy at least one verified backup off the Linux machine before real guest data matters.

### B. Ask the user what they want after launch

They drive priorities by using the app and reporting what's wrong. Do not let
the backlog delay deployment or silently select a feature for them.

### C. Artwork for templates *(highest-value if the editor still feels sparse)*

`public/design-assets/` is still **empty**. Templates compose from
`lucide-react` line icons plus 4 hand-authored SVG motifs. Constraints that
already exist and must be respected: never accept sender-uploaded SVG
(stored-XSS risk, settled), no third-party SVG packs for the same reason one
level removed, icons always `lucide-react`, never emoji. New artwork should
be hand-authored or vetted line-by-line — ask before pulling in any external
asset source.

### D. Remaining editor gaps

1. **Line height + letter spacing** in the text panel — the obvious omissions
   now that everything else is exposed.
2. **Canvas size choice.** Locked to 1000×1250 (4:5); `canvasWidth`/
   `canvasHeight` are already stored per event, so the data model is ready
   for portrait/square/landscape.

### E. Loose ends

- **RSVP `questions` can't be edited after creation.** `external_url` now
  can; same shape of fix in `PUT /api/events/[slug]`.
- **An RSVP row can be deleted but not edited** — both by the guest (one
  submission only) and by the sender (delete only, no edit). An edit path is
  the obvious next step if wrong answers keep happening.
- **No un-publish.** One-directional by design; the user has never asked to
  change it. Worth one question rather than assuming.
- **No CSV export / broader per-guest management** beyond the Statistics
  modal (which now supports per-row and per-invitation delete).
- **Per-page `<title>`** — every page is just "RSVP", including the guest
  page.
- **The sender dashboard Overview and the logged-in admin gateway are both
  near-empty screens** — no counts, no recent activity. The invitation
  gallery still shows a generic placeholder for every invitation except
  `custom_card`, despite designed cards having everything needed to render a
  real thumbnail (the same read-only canvas the guest page already uses).

### F. Housekeeping the user may want

- **Scratch test data** in the dev database from earlier automated runs.
  **Offer to clean, don't just do it** — deleting rows is destructive and
  needs their say-so. There is also a standing rule never to use Seed/Purge
  in testing. As of 2026-07-29 the two `external_link` rows created during
  this session's own testing were deleted with the user's explicit
  confirmation; anything older hasn't been touched.
- **`SESSION_SECRET` and admin credentials are already handled (2026-07-29).**
  `SESSION_SECRET` is set in `.env.local`; startup auto-generates a private
  48-byte value if absent/short, and any server start throws below 32 bytes.
  Admin login has **no hardcoded fallback at all** anymore
  — `ADMIN_USERNAME`/`ADMIN_PASSWORD` must be set in `.env.local` or admin
  login returns 503. This was forced by discovering the repo is genuinely
  public, which permanently exposed the original committed pair in git
  history; the fix stops it from being the *live* credential going forward,
  it doesn't erase the historical record, and the user explicitly declined
  rewriting git history to do so. Neither value is written in any md file —
  ask the user directly if admin access is needed.
- **No committed app test suite exists.** Verification scripts are deliberately written to a
  scratch directory and deleted after use rather than committed — see
  "Landmines" below for why they can't live in the project root at all, not
  just why they aren't committed. A real suite needs the `require()`/
  clean-eslint tension solved first.
- **Security-test data was intentionally retained:** sender
  `security_hammer_1785389430574` / display name "Security Hammer Test" and
  draft "Security Hammer Draft" (`bbdjg6yj`), plus tiny custom card "Lazy
  loading verification 1785426211217" (`5kkwemx4`). Offer cleanup; never
  delete it or other rows without explicit approval.

---

## 3. Landmines — read before touching the editor (or testing anything live)

These cost real time to find. Don't rediscover them.

### Process

**Never edit a source file with a terminal command.** A `Set-Content -NoNewline`
once collapsed a 65KB component onto one line and destroyed working code. Use
the edit tools only. After any external write, the VS Code buffer and disk can
disagree — `read_file` may serve the buffer while `tsc` reads disk. Cross-check
with `Get-Content`. VS Code local history
(`%APPDATA%\Code\User\History\<hash>\entries.json`) is the recovery route.

**Never fake a server failure against a destructive endpoint.** A rollback test
once intercepted `DELETE /api/users/:id` with a *delayed* fake 503; calling
`page.unroute()` before that delayed fulfil completed **released the held
request to the real server** and genuinely deleted a user row. Use a read-only
endpoint to prove a rollback path (aborting a `GET` works), prefer
`route.abort()` over a delayed `fulfill`, and never unroute mid-flight.

**Test data goes in an isolated browser context/profile**, never the shared
VS Code browser or the user's real Chrome — logging in there clobbers the
user's own live admin/sender cookies. Use a dedicated headless instance with
its own `--user-data-dir`, and kill only that specific PID afterward (never a
name-based `taskkill`/`pkill` against Chrome).

**Verification scripts must live outside the project directory** (the
session's own scratchpad, not the repo root) — Next's dev-server file watcher
picks up *any* file change inside the project tree as a source change and
triggers a Fast Refresh rebuild for it, including a throwaway `.js` test
script sitting in the repo root. Repeatedly editing one there during a test
session caused a genuine rebuild-storm that corrupted several "live" test
results in the 2026-07-29 session before this was caught — not a product bug,
a self-inflicted test-harness one. Run scratch Node scripts with
`NODE_PATH=<repo>/node_modules` (or launch them from inside the repo, if
truly necessary) so `require("ws")` etc. still resolve without the file
itself living in the watched tree.

**Before trusting a "live" server test, confirm the dev server is actually
fresh.** A stale `node.exe` process from earlier in the same session can go
on serving old code indefinitely if a later `npm run dev` fails silently
(e.g. "Another next dev server is already running" logged to a file nobody
reread) — this produced real false negatives in the 2026-07-29 session. Check
`netstat -ano | findstr :3001` matches the PID you actually expect, or just
kill and restart clean before a test that matters.

**An apparent memory leak on Windows may be Turbopack, not app code.**
node.exe jumping from steady low hundreds-of-MB to multiple GB, with high
CPU/fan noise, was traced 2026-07-29 to a broken junction point in
`.next/dev/node_modules/<pkg>-*` — Turbopack retries repairing it on every
request touching that package (`os error 145`, "directory not empty"), and
the retry storm is what spikes memory and eventually corrupts the whole
module graph (`MODULE_UNPARSABLE`). Fix: stop the dev server and delete
`.next`, then restart. Check this before spending time auditing app code for
a leak.

### Rendering

**`canvas.requestRenderAll()` silently does nothing in a background tab.** It
defers to `requestAnimationFrame`, which browsers throttle to a standstill when
the tab isn't foregrounded. **Discrete, user-triggered canvas changes must call
synchronous `canvas.renderAll()`.**

**`ResizeObserver` is also suspended in a hidden tab** — including its initial
observation. The canvas sizes itself from that, so a hidden tab makes the editor
look broken (canvas at full 1000×1250, hanging off the viewport at negative y).
Check `document.visibilityState` before investigating any sizing bug.

**A JS-measured height driving an inline `style.height` + `overflow: hidden`
is fragile — prefer a pure-CSS technique.** `StatsModal`'s empty↔populated
transition originally used `ResizeObserver` to measure content height and set
it as an explicit px value; if that measurement ever went stale (a rebuild
storm, a timing gap), the wrapper stayed at the old height while `overflow:
hidden` silently clipped the real, larger content to a sliver — a genuine
"blank card" bug the user hit. Rebuilt on `grid-template-rows: 0fr → 1fr`
instead, which has no JS state to go stale. If a future animated-height need
comes up, reach for this pattern first.

**`obj.set()` alone doesn't repaint a text object.** The full sequence is:

```ts
obj.set({ fontFamily });
obj.initDimensions();
obj.setCoords();
obj.dirty = true;
canvas.renderAll();
```

### Fonts

- Canvas 2D's `ctx.font` **cannot resolve CSS custom properties**. Resolve with
  `getComputedStyle` on `document.documentElement` first.
- A canvas draw does **not** trigger a `next/font` fetch — `await
  document.fonts.load(...)` explicitly.
- **Never trust a stored font family.** Store the stable id and re-resolve after
  every `loadFromJSON`. This is also what fixes the guest page, where nothing
  else would trigger a corrective re-render.
- `document.fonts.check()` returns **true** when only the *fallback* face is
  loaded.

### Fabric API (v7 — differs from v5 tutorials)

- `object.clone()` and `FabricImage.fromURL()` are **Promise-based** since v6.
- `getPointer` is deprecated → `getScenePoint` / `getViewportPoint`.
- Custom properties are dropped by `toJSON()`. Always serialize with
  `canvas.toObject([...customProps])`.
- All text is `fabric.Textbox`. It extends `IText`, so `instanceof fabric.IText`
  checks still match — keep it that way.
- **Guard every async canvas callback** with `if (fabricRef.current !== canvas) return;`
  React StrictMode double-mounts, and drawing into a disposed canvas throws.
- **Per-character styles**: Fabric groups adjacent characters into ranges using a
  **fixed whitelist** of properties. A custom marker key is stored but not
  consulted for run boundaries, so two runs differing *only* by the marker get
  merged and one is lost. Always co-store a whitelisted property (`fontFamily`)
  alongside any custom marker.
- Text editing runs through Fabric's own hidden `<textarea>`
  (`data-fabric="textarea"`). Any "is the user typing in a form field" guard must
  exclude it, or shortcuts die exactly when text is being edited.
- `viewportTransform` is **not** part of `canvas.toObject()`, which is what makes
  editor zoom/pan safe — it can't leak into the saved design or the guest page.

### CSS

**A CSS `animation` overrides an inline `transform` — for the whole animation's
duration, and this bites in more than one place.** First found on
`ThemedTooltip`'s own centring transform being discarded by its own reveal
animation (fixed by splitting position/centring onto an outer element and the
animation onto an inner one — two nested elements is deliberate, not
incidental). **Found again 2026-07-29 one level up**: `Modal.tsx`'s panel
reveal uses `animation: modal-panel-in ... both`, and the `both` fill-mode
keeps `transform: scale(1) translateY(0)` applied to the panel for its
*entire* open lifetime, not just mid-animation. Per the CSS spec, any
ancestor with a `transform` becomes the containing block for a descendant's
`position: fixed` — so a `ThemedTooltip` rendered inside a `Modal` was
"fixed" relative to the modal panel, not the viewport, landing its
viewport-relative coordinates miles outside the panel and inflating its
scrollable area (the actual cause of a "hovering the delete button makes the
whole stats card scroll/shrink" bug report). Fixed by portaling
`ThemedTooltip` to `document.body`, same escape hatch `InvitationGallery`'s
own hover tooltip already used for the identical reason. **If a
`ThemedTooltip` (or anything else relying on `position: fixed`) ever behaves
strangely inside a `Modal` or any other animated-transform container again,
check this first.**

**A `w-full` child inside a wrapping flex row claims the whole row** and pushes
its siblings onto a second line. This is what orphaned the "Clear filters"
button on `/admin/db`.

### Browser automation

- React maps `onMouseEnter` to delegated **`mouseover`** — a raw `mouseenter`
  does nothing, and a raw DOM `dispatchEvent(new Event("input"))` on a
  React-controlled `<input>` does **not** reliably fire React's own
  `onChange` either (React intercepts the native value setter). A test that
  types via raw DOM mutation instead of a real input path can produce a false
  positive/negative on anything checking controlled-input state — this
  surfaced 2026-07-29 while verifying that a live WS update doesn't clobber
  an in-progress form edit. Use CDP's `Input.insertText`/real key events (or
  Playwright's own `.fill()`/`.type()`), not `element.value = x;
  el.dispatchEvent(new Event("input"))`.
- `page.click()` / `hover()` time out on "visible and stable" for sidebar
  elements; use `page.evaluate(() => el.click())` or dispatch real
  `Input.dispatchMouseEvent` sequences over CDP.
- The editor's `beforeunload` guard fires during navigation — expect dialog
  interrupts, and register a handler that accepts the dialog.
- Changing `next.config.ts` needs a **full dev-server restart**, not a reload.

# NEXT_STEPS.md

Handoff for the next session. Rewritten 2026-07-28, so a fresh conversation can
pick up with nothing lost.

**Read order for a new session:** `SYSTEM_MEMORY.md` (what's true now) →
`CLAUDE.md` (why, and how the user works) → this file (what to do next).
Supporting detail: `ux walkthrough findings.md`, `security and bug fixes.md`,
`custom rsvp card designer.md`, `theme.md`.

---

## 0. Thirty-second orientation

An RSVP web app. A **sender** (host) creates an invitation and shares a link; a
**receiver** (guest) opens `/receiver/[slug]` and RSVPs. There's also a
localhost-only **admin** console.

Next.js 16 App Router / React 19 / TypeScript / Tailwind v4 / Postgres via raw
`pg` / custom `server.js` for a raw WebSocket / **port 3001** (3000 belongs to
the user's other project).

Four invitation kinds: `external_link`, `hosted_template`, `custom_card`,
`designed_template`. The last one — a Fabric.js canvas editor at
`/create/design`, with `/create/design/[slug]` as the permanent edit link — is
where nearly all recent work has gone and where the user's attention is.

### Getting running

```
npm run start:all          # docker + postgres + dev server, one command
# or, if Postgres is already up:
npm run dev                # http://localhost:3001
```

Admin login is at `/` (localhost only): `darkglory` / `R$vp@dm!n`.

Always finish with `npx tsc --noEmit` and `npx eslint .` — both currently pass
clean with zero warnings, and the project treats that as an invariant.

---

## 1. State as of this handoff

Everything below is **done and verified against a running app**, not theoretical.

- **Card editor is genuinely capable now.** Fonts render, all five colour roles
  are wired, undo/redo, copy/paste/cut/duplicate, layers with filename labels,
  drag-and-drop images, 5 occasion templates, 30 font pairs, 27 icons + 4
  decorations.
- **Snapping and alignment guides** — snaps to other elements' edges and centres,
  to the card's own centre/edges/safe-area, and to equal spacing between
  elements. Both axes snap in the same drag. Hold **Ctrl** to suppress. Rotation
  snaps to 15°.
- **Per-character text styling** — select part of a sentence and apply
  bold/italic/underline (Ctrl+B/I/U), colour, or a different font to just that
  run. Persists correctly and renders identically on the guest page.
- **Text boxes hug their content** and re-fit as you type or change font.
  Dragging a side handle opts a box out of auto-sizing.
- **Zoom and pan** — verified not to touch object coordinates or leak into the
  saved design.
- **Security pass complete** — 74 automated checks. Biggest fix: a SQL
  LIKE-wildcard weakness in login (`username ILIKE $1`, where `%` matched every
  user).
- **Transparent PNGs work** (WebP re-encode preserves alpha; verified by pixel
  sampling in the editor and on the guest page).
- **Next.js dev badge hidden** (`devIndicators: false`) — it was covering
  "Create Invitation" and "Log Out".
- **Optimistic UI everywhere it makes sense** (`src/lib/optimistic.ts`) — saves,
  publishes, deletes, renames and the guest's own RSVP submission all land
  instantly and roll back if the server refuses. Deliberately *not* applied to
  Seed/Purge or to anything that redirects to a server-minted slug.
- **macOS-style notification stack**, mounted once in the root layout, so a
  failure surfaces from any screen. Behaviour ported from the reference
  project; look is flat (no Bistro Glaze) per explicit instruction.
- **Statistics view completed**: declined RSVPs now get their own slice and
  breakdown row, counts of one read "1 Kid" not "1 Kids", and the sender can
  delete an individual RSVP (`DELETE /api/events/[slug]/rsvps/[id]`).
- **No health pin on `/receiver/*`** — guests can't act on server latency.

---

## 2. Recommended next steps, in priority order

### A. Ask the user what they want first

They drive priorities by using the app and reporting what's wrong. **Do not
assume this list is what they want.** Every significant improvement so far
started from their hands-on feedback, not from a backlog.

### B. Resolve the open UX decisions in `ux walkthrough findings.md`

That doc is the output of a full hands-on pass over every screen. Its §2 items
are deliberately *not* implemented — they need the user's call. The headline one:

> **Guests never see the event details on a designed card.** Title, host, date,
> location and description are shown above the card for every other invitation
> type. On a designed card they appear nowhere — the guest sees only the canvas
> and the RSVP form. So unless the sender manually adds a text box saying when
> and where, guests are never told. The Details tab looks broken from the
> sender's side, and `/sender/landing` explicitly promises "add the essentials —
> time, place, host". Three options are laid out in that doc.

Also in §2: the sender dashboard Overview and the logged-in admin gateway are
both near-empty screens; the invitation gallery shows an identical placeholder
for every invitation instead of real thumbnails.

### C. Artwork for templates *(highest-value if the editor still feels sparse)*

`public/design-assets/` is **empty**. Templates compose from `lucide-react` line
icons plus 4 hand-authored SVG motifs. That's why cards can still read as plain
even though the layouts are sound.

Constraints that already exist and must be respected:
- **Never accept sender-uploaded SVG** — stored-XSS risk, a settled decision.
- Third-party SVG packs were rejected for the same reason one level removed.
  Existing decorations are hand-authored, fully reviewed inline path data.
- Icons are always `lucide-react`, **never emoji** (tried and explicitly
  rejected as low-effort).

So new artwork should be hand-authored or vetted line-by-line. Ask before
pulling in any external asset source.

### D. Remaining editor gaps

1. **Line height + letter spacing** in the text panel (`lineHeight`,
   `charSpacing` — the latter is in 1/1000 em, not px). The obvious omissions
   now that everything else is exposed.
2. **Canvas size choice.** Locked to 1000×1250 (4:5). Portrait/square/landscape
   would need `canvasWidth`/`canvasHeight` to become user-settable — they're
   already stored per event, so the data model is ready.

### E. Loose ends

- **`/create/link` and `/create/template` are dead.** Fully functional, but the
  landing page and the New Invitation modal have both settled on two flows
  (design in our editor / bring your own card), so nothing navigates to them.
  They're also the last files using raw Tailwind colours instead of theme
  variables. Decide with the user: wire in, or delete.
- **RSVP `questions` can't be edited after creation.** `external_url` now can;
  same shape of fix in `PUT /api/events/[slug]`.
- **An RSVP can be deleted but not edited** — both by the guest (who only ever
  gets one submission) and by the sender (delete only). An edit path is the
  obvious next step if wrong answers keep happening.
- **`qrcode` is installed and never imported.** Wiring it onto the guest page is
  a small, self-contained win.
- **No un-publish.** One-directional by design; the user has never asked to
  change it. Worth one question rather than assuming.
- **No CSV export / per-guest management** beyond the Statistics modal.
- **Per-page `<title>`** — every page is just "RSVP", including the guest page.

### F. Housekeeping the user may want

- **Scratch test data** in the dev database from automated runs (accounts
  prefixed `testhost` / `cdp` / `diag` / `extl` / `other` / `pct`, plus some
  deliberately absurd entries used to test truncation). **Offer to clean these,
  don't just do it** — deleting rows is destructive and needs their say-so.
  There is also a standing rule never to use Seed/Purge in testing.
  *(As of 2026-07-28 the DB is nearly empty: the user's own account plus a
  `statscheck1` / "Stats check party" pair left by the statistics verification.)*
- **Before any deployment**: `SESSION_SECRET` still falls back to a committed
  dev value (a production build throws rather than starting insecure), and admin
  credentials default to the committed pair unless `ADMIN_USERNAME` /
  `ADMIN_PASSWORD` are set.
- **No tests exist.** Verification scripts were deliberately deleted rather than
  committed — they used `require()` and would have broken the clean-eslint
  invariant. A real suite needs that constraint solved first.

---

## 3. Landmines — read before touching the editor

These cost real time to find. Don't rediscover them.

### Process

**Never edit a source file with a terminal command.** A `Set-Content -NoNewline`
collapsed a 65KB component onto one line and destroyed working code. Use the
edit tools only. After any external write, the VS Code buffer and disk can
disagree — `read_file` may serve the buffer while `tsc` reads disk. Cross-check
with `Get-Content`. VS Code local history
(`%APPDATA%\Code\User\History\<hash>\entries.json`) is the recovery route.

**Never fake a server failure against a destructive endpoint.** A rollback test
intercepted a `DELETE /api/users/:id` with a *delayed* fake 503; calling
`page.unroute()` before that delayed fulfil completed **released the held
request to the real server** and genuinely deleted a user row. Use a read-only
endpoint to prove a rollback path (aborting a `GET` works), prefer
`route.abort()` over a delayed `fulfill`, and never unroute mid-flight.

**Test data goes in an isolated Playwright context** (`browser.newContext()`),
never the shared VS Code browser — logging in there clobbers the user's own
live admin/sender cookies.

### Rendering

**`canvas.requestRenderAll()` silently does nothing in a background tab.** It
defers to `requestAnimationFrame`, which browsers throttle to a standstill when
the tab isn't foregrounded. **Discrete, user-triggered canvas changes must call
synchronous `canvas.renderAll()`.**

**`ResizeObserver` is also suspended in a hidden tab** — including its initial
observation. The canvas sizes itself from that, so a hidden tab makes the editor
look broken (canvas at full 1000×1250, hanging off the viewport at negative y).
Check `document.visibilityState` before investigating any sizing bug.

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

**A CSS animation overrides an inline `transform`.** This broke tooltip
centring: the reveal animation animates `transform`, discarding an inline
`translateX(-50%)`. `ThemedTooltip` uses two nested elements — outer owns
position and centring, inner owns the animation.

**A `w-full` child inside a wrapping flex row claims the whole row** and pushes
its siblings onto a second line. This is what orphaned the "Clear filters"
button on `/admin/db`.

### Browser automation

- React maps `onMouseEnter` to delegated **`mouseover`** — a raw `mouseenter`
  does nothing.
- `page.click()` / `hover()` time out on "visible and stable" for sidebar
  elements; use `page.evaluate(() => el.click())`.
- The editor's `beforeunload` guard fires during navigation — expect dialog
  interrupts, and register `page.on('dialog', d => d.accept())`.
- Changing `next.config.ts` needs a **full dev-server restart**, not a reload.

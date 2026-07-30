# Security & Bug Fix Pass — 2026-07-28

> Historical pass. For the broader 2026-07-29 audit, remediation status,
> hammer results, remaining deployment controls, and current limits, read
> `security.md`. Findings below remain useful history but are not exhaustive
> current security documentation.

Companion to the read-only card-editor audit that preceded this (that doc was
deleted in the 2026-07-28 cleanup once every finding in it had been fixed — it
described code that no longer exists).
Everything listed here is **fixed and verified against a running app**, not proposed.

Verification: 74 automated checks across four suites (API/security, editor
fonts+colours, editor images+live-refresh, card upload), all passing, plus
`npx tsc --noEmit` and `npx eslint .` clean. The throwaway test scripts were
removed afterwards — the project still has no committed test suite.

---

## Security

### Critical

**SQL LIKE-wildcard injection in the username lookup.** `src/app/api/sender/login/route.ts`
and `register/route.ts` both used `WHERE username ILIKE $1` with the raw
user-supplied value. `%` and `_` are ILIKE wildcards, so logging in as `%`
matched *every* user row and handed back an arbitrary account for the password
check — turning "guess a username **and** its password" into "guess **any one**
account's password." `_` let an attacker steer which account matched.
Fixed to `WHERE lower(username) = lower($1)`, which keeps the intended
case-insensitive login without wildcard semantics. A `users_username_lower_idx`
unique index was added in `src/lib/db.ts` so the database enforces the same
uniqueness rule the auth code assumes (previously `Bob` and `bob` could coexist
and the lookup would pick one arbitrarily).

**Unpublished drafts were readable by anyone.** `GET /api/events/[slug]` had no
auth gate and no `published` check, so the entire publish mechanism was
page-level only — anyone holding a slug could read a full draft straight from
the API. Now mirrors the `/receiver/[slug]` gate: unpublished events 404 for
everyone except the owning sender (same 404 an unknown slug gets, so it can't
be used to confirm a slug exists). `created_by` is also stripped from the
response.

### Info disclosure

**`/api/health` leaked internals to the whole LAN.** The endpoint is
deliberately unauthenticated (the Settings pill renders on public pages), but
it returned the **raw Postgres error string**, database size, connection-pool
counts and live socket count to any caller — and the app binds to `0.0.0.0`.
Now everyone gets `tier` + `connected` + latency; the internals and the real
error text are localhost-only, matching `HealthPin`'s existing
`detailLevel="full"` being an `/admin/db`-only prop.

### Hardening

- **Admin login was not constant-time.** `username !== X || password !== Y`
  leaks how much of the credential matched via response timing — the sender
  login already guarded against this with a dummy-hash bcrypt compare. Now uses
  a padded `timingSafeEqual`, and both comparisons always run (no `&&`
  short-circuit). Credentials now also read from `ADMIN_USERNAME`/`ADMIN_PASSWORD`
  env vars and fail closed when either is unset; there is no committed fallback.
- **`SESSION_SECRET` fell back silently.** The dev fallback is committed to the
  repo, so anyone who has seen the source could forge admin/sender cookies. A
  production build now refuses to start without a real secret; dev still warns.
- **Session payloads weren't shape-checked.** A token missing `exp` read as
  "not expired" (`undefined < Date.now()` is false). Now validated after parse.
- **No request-body size limit anywhere.** Route handlers buffered whatever was
  sent. Added `bodyTooLarge()` (`src/lib/validation.ts`): 64KB on credential /
  simple routes, 16MB on the two that legitimately carry an image or a canvas.
- **Every text field was unbounded.** Name, username, title, host, location,
  description, guest name, RSVP answers, external URL, question labels — all
  went straight into TEXT columns at any length. All bounded now, truncating
  rather than rejecting, with matching `maxLength` on the inputs.
- **RSVP `answers` was stored verbatim.** Arbitrary keys, arbitrary size. Now
  filtered to the event's own question ids with bounded values.
- **Guest categories were unbounded and could duplicate.** Capped at 12 × 40
  chars, and case-insensitive duplicates are dropped (two identical categories
  rendered two inputs writing to the same key, so one silently overwrote the
  other).
- **`questions` was stored after only an `Array.isArray` check.** Capped at 20
  with bounded labels and a validated `type`.
- **Rate-limiter map grew forever.** Expired windows were reset in place but
  never deleted — one permanent entry per (bucket, IP) pair. Added a throttled
  sweep.
- **WebSocket clients were unbounded with no liveness check.** Added a 200-client
  cap and ping/pong reaping, so sockets that vanish without a clean close
  (phone leaves wifi, laptop sleeps) don't accumulate.
- **Admin password reset had no minimum length** while signup required 8. Aligned.
- `rel="noopener noreferrer"` added to the two `target="_blank"` links.

---

## Bugs

### Data loss

**Publishing wiped host name, description, date and location.** Both editors'
Publish button sends only `{title, published: true}`, but `PUT /api/events/[slug]`
wrote `host_name`/`description`/`event_date`/`location` **unconditionally** as
`body.X || null`. Local React state still showed the old values, so it looked
fine until reload. Every field now follows the same "absent key means don't
touch it" rule the route already used for `guestCategories` and `designConfig`.

**Adding a photo silently destroyed the whole design.** Uploads were capped at
5MB, base64 inflates ~33%, and `MAX_CANVAS_JSON_BYTES` was 2MB — so a normal
photo pushed the serialized canvas past the cap, at which point
`sanitizeDesignConfig` (clamp-don't-reject) replaced the entire canvas with
`{objects: []}` and returned 200 with "Saved." Fixed on four fronts: images are
downscaled and re-encoded before they touch the canvas, the cap was raised to
8MB, the editor checks the bound itself and shows a real error, and the server
still clamps as a backstop for hostile callers.

### The card editor

**Fonts never reached the canvas.** `FabricCanvas` created text with no
`fontFamily` at all, so all 30 curated pairs and ~51 loaded Google fonts were
decorative — every card rendered in Fabric's default. Two traps behind it:
canvas 2D's `ctx.font` doesn't resolve CSS custom properties, and Fabric caches
text metrics so a font finishing loading later doesn't redraw. Now
`resolveFontFamily()` reads the real generated family off the CSS variable,
`ensureFontsLoaded()` waits via `document.fonts.load()`, and the family is
re-applied after every `loadFromJSON` and on every pair change. The resolved
name is deliberately **not** baked into stored JSON — the stable `fontPairId`
is stored and re-resolved at render time, which also fixes the guest page,
where nothing would otherwise ever trigger a corrective re-render.

Text objects now carry a `fontRole` (`display`/`body`), so "Add Heading" and
"Add Body Text" each use the right half of the pair.

**Three of the five colour fields did nothing.** Only `background` and `accent`
were wired; new text was hardcoded `#000000` — invisible on a dark card. New
text now uses `colors.text`, and a swatch row applies any of the five to the
current selection.

**The guest page never live-updated.** `GuestEventView` refetched on the
`db-changed` broadcast and passed down new `canvasJSON`, but the canvas was
built once in an effect keyed on `[readOnly]` with no remount — so the new JSON
was never loaded. Added a reload effect (read-only side only; reloading
mid-edit would wipe the sender's selection).

**Fabric drew into a disposed canvas.** Surfaced as
`TypeError: Cannot read properties of undefined (reading 'clearRect')` in the
dev log on `/create/design/[slug]`: `loadFromJSON`'s promise resolved after
React StrictMode had already disposed the first canvas. Every deferred canvas
callback now checks it's still the live instance.

**Boolean RSVP answers.** The yes/no `<select>` submits the strings
`"yes"`/`"no"`, so a plain `Boolean(value)` would have stored `"no"` as `true`.
Coerced explicitly. (Caught while adding answer validation — it would have been
a new bug, not an existing one.)

**Recolor swatch always opened on black** instead of the selected object's
actual colour.

### Robustness

- `initDb()` cached a *rejected* promise forever, so one transient DB hiccup at
  startup broke every later request until a restart. Now clears the memo on
  failure so the next request retries.
- Slug collisions threw an unhandled 500. Now retries with fresh slugs.
- Renaming a user to an existing username threw an unhandled 500. Now 409.
- A non-UUID id on `/api/users/[id]` threw an unhandled 500 (`invalid input
  syntax for type uuid`). Now 404.
- `POST /api/events` stored the untrimmed `body.externalUrl` while validating
  the trimmed one.

---

## Added, because the fixes needed them

- **Duplicate** control on a selection (`object.clone()` is Promise-based in
  Fabric v6+, not the v5 callback).
- **Drag-and-drop an image onto the card** — previously file-picker only,
  despite being explicitly requested.
- `src/lib/validation.ts` — shared input bounds and the body-size guard.

---

## Image handling changed shape

Per instruction, **5MB is now a compression target, not a rejection**. Any
accepted image is downscaled (1600px longest edge for canvas objects, 2400px
for a bring-your-own card) and re-encoded to WebP — falling back to JPEG where
the browser refuses WebP from a canvas — stepping quality and then dimensions
down until it fits the 5MB per-image budget. Verified: a 5.2MB source is
accepted and stored at ~1.7MB instead of being turned away.

---

## Still open (not touched)

The gaps from the preceding audit that are features rather than defects:
no undo/redo, no text styling controls (size/bold/align/spacing), still `IText`
rather than `Textbox`, no alignment guides, no zoom/pan, no canvas size choice,
and — the big one — **no occasion templates**; `public/design-assets/` is still
empty. Also unchanged: `/create/link` and `/create/template` remain orphaned,
`external_url` and `questions` still can't be edited after creation, and the
guest card is still capped at 28rem wide.

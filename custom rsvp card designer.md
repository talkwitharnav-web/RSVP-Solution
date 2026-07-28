# Custom RSVP Card Designer — Research & Build

Doc for the "Design in our editor" flow — the disabled/coming-soon option in
`NewInvitationModal.tsx`, sitting alongside `custom_card` (bring-your-own-image,
already built) as the second `EventKind` this project always intended to add.
Sections 1–5 are the original research pass (2026-07-27, no implementation).
Section 7 (added same day, later in the session) is the actual approach being
built — a middle ground between Approach A (freeform canvas) and Approach B
(pure template+CSS swap) that the user asked for after reading this doc.

## 0. Status

**Built and working end-to-end** (2026-07-27). See section 7 for the chosen
approach, section 8 for the build checklist (all core items complete), and
section 9 for the UI-shape correction made partway through the build.
Sections 1–6 remain as original research context — don't edit those to
match final decisions; section 7 supersedes them where they differ.

## 1. How other products approach this

Looked at three shapes of product: full general-purpose design tools (Canva),
invitation-specific template makers (Greetings Island, Paperless Post), and
modern RSVP-first social apps (Partiful).

### Greetings Island / Paperless Post (invitation-specific template makers)
- Organize their entire library by **occasion** first (birthday, wedding, baby
  shower, graduation, holiday...), not by visual style first. A user picks
  "what kind of event" before "what it looks like."
- Within an occasion, they show a grid of **complete pre-made templates** —
  every template already has a color scheme, font pairing, and layout baked
  in. The user picks a template close to what they want, then edits pieces of
  it (swap text, swap a color, swap a photo), rather than starting from a
  blank canvas and placing elements one at a time.
- Editing is scoped: change text, change the color scheme (from a small curated
  set the template shipped with), change fonts (again, curated), swap in an
  uploaded photo into a pre-defined photo slot. Free-form layout rearranging is
  rare or entirely absent in the free tier.
- Paperless Post specifically distinguishes "Cards" (stationery-style, an
  invitation animating out of an envelope) from "Flyers" (a plainer shareable
  page) — i.e. even they have a lighter-weight non-canvas format alongside
  their premium animated one.

### Canva (general-purpose, not invitation-specific)
- True freeform canvas: drag any element anywhere, resize/rotate/reorder/layer
  arbitrarily. Massively more powerful, massively more complex to build and to
  use. Canva's own templates exist to hide that complexity from most users —
  most people still start from a template and nudge it, they don't build from
  a blank canvas.

### Partiful (modern, RSVP/social-first, not a general design tool)
- Doesn't sell itself on layout flexibility at all. Its differentiator is
  **animated themes** — a small curated set of full themes (fonts + palette +
  motion effects like a shimmer or a moving background) applied to a fairly
  fixed page layout. The design decision is "which theme," not "where does
  this text box go."
- This is the closest existing product to what a "prove it works, don't
  polish yet" version of our own editor should probably look like: pick a
  preset **theme** (palette + font pair + maybe one decorative motif), fill in
  fixed fields, done. No free positioning at all.

**Takeaway for this project**: every one of these products steers the average
user toward "pick a template/theme, then customize within it" rather than
"place every element yourself." A from-scratch freeform canvas is the
Canva end of the spectrum — most invitation-specific products don't actually
build that; they build a curated template picker with scoped editing on top.
Given this project's stated philosophy (prove the loop works before adding
polish/flexibility — see `CLAUDE.md`), the Partiful/Greetings-Island end of
the spectrum is the realistic starting point, not the Canva end.

## 2. Two fundamentally different technical approaches

### Approach A — Freeform canvas editor (the "real design tool" approach)
The user has a blank (or template-seeded) canvas and can place/move/resize/
rotate/layer text boxes, images, and shapes anywhere.

**Libraries researched:**

| Library | What it is | Fit here |
|---|---|---|
| **Fabric.js** | The most commonly recommended library specifically for *design-editor*-style apps (as opposed to diagramming/interactive-UI apps) as of 2026 comparisons. Single-canvas model, rich object model (text, images, shapes, groups), built-in selection/resize/rotate handles, serializes to/from JSON. No official React bindings — you wire it up yourself inside a `useEffect` + ref. | Best raw fit for "a real card designer," but the most implementation work, and no React-idiomatic API. |
| **Konva / react-konva** | Official React bindings (also Vue/Svelte/Angular), multi-layer canvas architecture tuned for rendering *many* objects fast (dirty-region redraw). More geared toward interactive UI/diagramming than classic "design tool" ergonomics, but very workable for a card editor and much more pleasant to build in React than raw Fabric.js. | Best fit if staying idiomatic-React matters more than matching exactly what commercial design tools use internally. |
| **PixiJS** | WebGL-first, built for games/high-performance graphics. Overkill — a card editor has maybe a dozen objects on screen, not thousands. | Not a good fit; wrong tool for this scale. |
| **dnd-kit** / **Puck** / **react-dragd** | DOM-based (not canvas) drag-and-drop *page builders* — you drag real HTML elements around, not canvas-drawn objects. Puck in particular is built explicitly for "build your own visual editor" (fields mapped to component props, resizable canvas, publish/render pipeline) rather than free-pixel-position design. | Wrong shape for a *card* (which wants free pixel positioning, rotation, layering) — better suited to page/layout builders where content stacks in blocks, not arbitrary placement. |

If a freeform canvas is ever built, **Fabric.js is the more standard choice
for a genuine design-tool feel; Konva is the more React-native choice.**
Neither is installed in this project yet.

### Approach B — Template + CSS-variable swap (the lightweight approach)
No canvas at all. A small number of hand-built layout "templates" exist as
real React/CSS components (same idea as `GuestEventView`/the existing
`custom_card` render path already in this codebase). Each template exposes a
small number of *swappable* things — a color palette choice, a font-pair
choice, maybe one optional decorative icon/motif — driven by CSS custom
properties, exactly like this project's own `--color-*` theme-token system
already works for the rest of the app (see `theme.md`/`globals.css`). The
sender doesn't move anything; they pick from dropdowns/swatches and see a
live preview update instantly because it's just CSS variables changing, not a
canvas re-render.

**Why this is a legitimate, not "lesser," approach**: this is genuinely how
production apps implement "theme customization" broadly (confirmed via
research into general CSS-variable theming practice) — swap `--card-accent`,
`--card-font-display`, etc. and the whole template updates live, no reflow
logic, no serialization format, no undo/redo stack to build. It's also
**exactly the pattern already proven out in this codebase** for light/dark
theme and the accessibility CVD-palette system — same mechanism, new axis of
variation (per-invitation instead of per-viewer).

**Effort/complexity comparison**:

| | Approach A (canvas) | Approach B (template swap) |
|---|---|---|
| New dependency | Fabric.js or Konva (neither installed) | None — reuses existing CSS-variable theming pattern |
| Data model | Needs a serialized "scene graph" (list of positioned/rotated/layered objects) stored per event | A handful of small fields: `templateId`, `paletteId`, `fontPairId`, maybe `iconId` — fits cleanly into the existing `events` table shape |
| Guest-facing render | Must re-render the canvas (or a canvas-to-image export) on `/receiver/[slug]` | Trivial — same server-rendered React + CSS this project already does everywhere else |
| Editing UX to build | Drag/select/resize/rotate/layer/undo — a lot of interaction surface | Dropdowns + swatches + live preview — small, standard form UI, matches the "form, not editor" pattern this project already uses everywhere (event editor, guest categories, etc.) |
| Matches project's stated stage | No — this is the "richer template editor" explicitly deferred until after proving the base loop | **Yes** — this is proof-of-concept-appropriate scope |

**Recommendation for when this gets built**: start with Approach B. It's a
strict superset of effort already spent on this project's theming system, it
keeps `EventRecord` a small typed row instead of a JSON scene graph, and it
matches the "prove it works, then add richness" staging this project has
followed for every other feature so far (guest categories, statistics,
custom-card upload all shipped as plain forms before any visual editor
existed). Approach A (real canvas) is a legitimate *later* upgrade once
Approach B's ceiling is actually felt as limiting — not a starting point.

## 3. What "elements" a template actually needs, concretely

Looking at what both this project's existing `GuestEventView`/`custom_card`
render and commercial templates actually contain, the reusable building
blocks are:

- **Title** (event name) — always present, largest text
- **Subtitle / host line** ("hosted by ___") — optional
- **Date/time block** — often visually distinct (a "save the date"-style
  stacked mm/dd or a line of text)
- **Location** — text, sometimes with a map-pin icon
- **Description / body copy** — free text, smaller
- **Hero visual** — either an uploaded photo (already built via `custom_card`)
  or, for a from-template design, a solid/gradient background + an optional
  decorative icon/motif instead of a photo
- **RSVP call-to-action** — the button/link into the hosted RSVP form
  (already exists; not something the designer needs to create, just render
  inside the chosen template's visual frame)
- **Decorative accents** — a border treatment, a corner motif, a small
  repeated icon/pattern — the "personality" layer. This is the one truly
  optional/skippable element; everything above is closer to required content.

This maps cleanly onto "one template = one arrangement of these blocks +
a palette + a font pair + an optional accent icon" — which is exactly
Approach B's data shape, not a full freeform canvas.

## 4. Presets: palettes, fonts, icons

### Color palettes
This project already has a validated palette-building method sitting unused
outside of Statistics: the **`dataviz` skill's** color-formula/validator
(`scripts/validate_palette.js` — already used once for the Statistics pie
chart, see `SYSTEM_MEMORY.md`). Reusing that same validator for a small set
of curated invitation palettes (e.g. 5–8 presets, each a 2–3 color set: an
accent, a background, a text-on-accent color) would guarantee every preset
clears contrast/colorblind checks the same way the current chart colors do —
no separate palette-QA process needed, just re-run a tool already in this
repo.

### Font pairs
**Cannot dynamically load "any Google Font the sender types in."** Researched
this directly: `next/font/google` (what this project already uses for
Bricolage Grotesque + Plus Jakarta Sans) resolves and subsets fonts at
**build time**, not runtime — there's no supported way to let a sender pick
an arbitrary Google Font by name and have it load correctly, without either
losing all of `next/font`'s optimization (self-hosting, preload, layout-shift
prevention) or maintaining a live network fetch of arbitrary font CSS at
runtime (extra request, no self-hosting, potential FOUC).

**The realistic approach**: define a **fixed, curated list** of font-pair
presets (e.g. 4–6 pairs), each pair imported statically via `next/font/google`
in `layout.tsx` exactly like the current two fonts are, each exposed as its
own CSS variable (`--font-display-preset-1`, `--font-display-preset-2`, ...).
The sender picks a preset by name/preview, not by typing a font name — same
shape as picking a color palette from swatches, not a hex-code input. This is
also how every researched commercial product actually behaves (Greetings
Island/Paperless Post templates offer a small curated font list per template,
not an open type-anything picker).

Reasonable starter pairs (based on the font-pairing research — one display
serif or display font + one clean body sans, repeated with different moods):
- Playfair Display + Inter (editorial/premium)
- Merriweather + Open Sans (warm, classic, accessible — Merriweather's tall
  x-height was specifically noted as good for scanning body paragraphs)
- Yellowtail (script) + Lato (casual/playful, closer to a hand-written invite feel)
- This project's own existing Bricolage Grotesque + Plus Jakarta Sans, as one
  of the presets rather than the only option

### Icons / decorative motifs
**No new package needed.** This project's icon rule (`SYSTEM_MEMORY.md`:
"Icons are always `lucide-react`, never emoji") already covers this — I
inventoried the installed `lucide-react` package directly and it already
ships plenty of invitation-relevant icons with zero new dependency:

- Celebration: `PartyPopper`, `Sparkle`/`Sparkles`, `Gift`, `Cake`/`CakeSlice`,
  `Trophy`, `Crown`
- Romance/warmth: `Heart`, `HeartHandshake`
- Nature/seasonal: `Flower`/`Flower2`, `Leaf`/`LeafyGreen`, `Sun`/`Sunrise`/
  `Sunset`, `Snowflake`, `Palmtree`/`TreePalm`
- Food & drink (dinner party/wedding-reception themes): `Wine`/`BottleWine`,
  `Utensils`/`UtensilsCrossed`
- Ambience: `Moon`/`MoonStar`, `Star`/`Stars`, `Bell`/`BellRing`, `Music`
- Also present: `Balloon` (a literal balloon icon)

A small curated *subset* of these (not the whole library) mapped to
template/theme names (e.g. "Garden" → `Flower2`, "Celebration" → `PartyPopper`
+ `Sparkles`, "Elegant Evening" → `MoonStar`) gives real decorative variety
with **zero new downloads** — this is a pure "pick from what's already
installed" job, unlike fonts or a canvas library.

**If real illustration/decoration (not just line icons) is wanted later** —
e.g. a confetti burst graphic, not just a confetti icon — free
commercial-use-safe SVG sources exist (SVG Repo, most under CC0/public-domain
style licenses; UXWing's own site states no-attribution commercial use) but
this is a "later, if line icons feel too sparse" option, not something
needed to start.

## 5. Data model sketch (not implemented — for later planning)

Sticking to Approach B, an eventual `custom_card`-style template kind could
add to `events` (illustrative column names, not a real migration):

- `template_id TEXT` — which of the curated layout templates
- `palette_id TEXT` — which curated color-palette preset
- `font_pair_id TEXT` — which curated font-pair preset
- `accent_icon TEXT` — optional, one of the curated lucide icon names

All four are small enums/lookups against a fixed in-code list (not
freeform user input, not a JSON blob) — same philosophy as `EventKind`
itself already being a fixed `CHECK` constraint, not a free string. This
keeps `initDb()`'s idempotent-migration pattern trivial (one nullable
column each) and keeps the guest-facing render a pure "look up 4 IDs, apply
4 sets of CSS variables" operation — no scene-graph parsing, no canvas
rehydration.

## 6. What would actually need to be built (rough shape, not a commitment)

1. A small fixed registry of templates (React components, like
   `GuestEventView` today) — start with maybe 2–3 layout shapes (e.g.
   "centered stack," "photo-optional hero + text," "stationery-card border
   frame").
2. A small fixed registry of palettes, run through the `dataviz` skill's
   validator once, each exposed as a CSS variable set.
3. A small fixed registry of font pairs, each statically imported via
   `next/font/google` in `layout.tsx`, each exposed as CSS variables.
4. A small curated subset of `lucide-react` icons mapped to template/theme
   names for the optional accent motif.
5. A picker UI in the New Invitation flow: template thumbnail grid → palette
   swatches → font-pair preview → optional icon picker → the same
   title/host/date/location/description fields the other two `EventKind`s
   already collect. This is additive to the existing creation-modal pattern,
   not a new UI paradigm.
6. `GuestEventView` gains a render branch for this new kind, the same way it
   already branches on `external_link` vs. hosted rendering.

None of this was implemented at the time this was written — see section 7
below for what actually got built.

## 7. Chosen approach — "template-constrained canvas" (the middle ground)

After reading sections 1–6, the user asked for a mix of Approach A (freeform
canvas) and Approach B (template + CSS swap). The agreed middle ground:

**Still start from a template** (no blank page — matches every commercial
product researched in section 1) **but a handful of specific elements on that
template become draggable/resizable within guardrails**, instead of the
template being a fully locked arrangement. Not true freeform placement —
bounded to a safe area, limited to repositioning/resizing existing named
slots (title, subtitle, photo, icon), not adding/deleting/rotating/layering
arbitrary new elements. This keeps the data model small (an offsets object,
not a scene graph) while giving real "make it feel like mine" flexibility
that pure Approach B doesn't offer.

### Library decision: hand-rolled, not a new dependency

Researched three real options for the drag/resize interaction itself:

| Option | Verdict |
|---|---|
| **react-moveable** | Full-featured (drag/resize/rotate/warp/snap) but last published ~3 years ago with no confirmed React 19 support — a real compatibility risk against this project's React 19 / Next 16 stack, and most of its feature surface (rotate, warp, pinch, group) is unneeded here. |
| **@dnd-kit/react** | Actively maintained, explicit React 19 support (peer dep `react ^18 \|\| ^19`) — but dnd-kit's whole model is built around sortable lists / drag-between-containers, not free x/y positioning + resize of a single element. Would fight the library more than use it for this specific job. |
| **react-rnd** | Confirmed via `npm info`: v10.5.3, peer dep `react: >=16.3.0` (no React 19 friction at all), does exactly drag + resize + bounds and nothing else. **Chosen.** |

Installed instead of hand-rolling pointer-event math from scratch, since
`react-rnd`'s peer dependency is permissive and its scope maps 1:1 onto what
this feature actually needs (bounded drag + resize, nothing more) — no
rotate/warp/pinch code to maintain that a hand-rolled version would also
have needed to explicitly *not* build.

### Data model

One new `EventKind`: `"designed_template"`. One new JSONB column on `events`,
`design_config`, rather than four separate columns — keeps the migration to
a single `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (matching this project's
existing idempotent-migration pattern in `src/lib/db.ts`) and matches how
`questions`/`guest_categories` already use JSONB for structured-but-flexible
per-event data on this same table.

```ts
type DesignConfig = {
  templateId: string;   // which layout template (src/lib/design-templates.ts)
  paletteId: string;    // which color palette (src/lib/design-palettes.ts)
  fontPairId: string;   // which font pairing (src/lib/design-fonts.ts)
  iconId: string | null; // optional decorative lucide icon (src/lib/design-icons.ts)
  slots: Record<string, { x: number; y: number; scale: number }>;
  // x/y are percentages (0-100) of the card's own bounding box, not pixels --
  // keeps the same design_config valid at any render size (editor vs. guest
  // page vs. a future share-image export) without recalculating anything.
  // scale is a multiplier off each slot's own default size (1 = default).
};
```

Each template defines its own fixed set of slot IDs and each slot's default
`{x, y, scale}` plus a bounding safe-area — the sender's edits are stored as
*overrides* layered on top of those defaults, not a full replacement, so a
slot the sender never touched still renders correctly from the template's
own defaults alone.

### Registries (all small, fixed, in-code — not user-authorable lists)

- **Templates** (`src/lib/design-templates.ts`): 2–3 layout shapes to start
  (a centered stack, a photo-optional hero-plus-text, a stationery-style
  bordered card), each a real React component plus a slot-defaults object.
- **Palettes** (`src/lib/design-palettes.ts`): a handful of curated
  accent/background/text combinations, hand-verified against the same
  WCAG-contrast bar `theme.md` already documents for the app's own palette
  (the `dataviz` skill's validator script isn't vendored into this repo, so
  rather than depending on invoking that skill mid-build, palettes are
  checked by the same manual contrast-math approach `theme.md` itself used).
- **Font pairs** (`src/lib/design-fonts.ts`): a handful of `next/font/google`
  pairs imported statically in `layout.tsx` (per section 4's finding that
  runtime-arbitrary font loading isn't supported), each exposed as its own
  CSS variable pair.
- **Icons** (`src/lib/design-icons.ts`): a curated subset of the
  `lucide-react` icons already inventoried in section 4 — no new install.

### What's genuinely different from section 6's original build-shape sketch

Section 6 (Approach B only) assumed a picker-only UI with no drag surface at
all. The actual build adds one more piece: a `SlotEditor` component
(`react-rnd` instances, one per template slot, bounded to the template's
declared safe-area) that sits in the creation/edit flow between "pick a
template" and "fill in the text fields" — everything else in section 6
(registries, `design_config` persistence, a `GuestEventView` render branch)
carries over unchanged in spirit, just with `design_config.slots` added to
what gets saved.

## 8. Build checklist

Tracked live here so the work can be picked up across sessions without
re-deriving the plan. Check items off as they land; add a one-line note only
if something changed from the plan above (not a full diary).

- [x] Install `react-rnd`
- [x] `src/lib/design-templates.ts` — 3 templates (Centered Stack, Photo
      Hero, Stationery Frame), each with slot defaults + safe-area bounds
- [x] `src/lib/design-palettes.ts` — 4 curated palettes (Garden, Celebration,
      Elegant Evening, Classic), each pair hand-verified at ≥4.5:1 WCAG
      contrast via a one-off script (relative-luminance contrast math, same
      standard `theme.md` holds the app's own palette to)
- [x] `src/lib/design-fonts.ts` — 4 curated font pairs (Signature/this app's
      own fonts, Editorial, Classic, Playful), static `next/font/google`
      imports wired into `layout.tsx`
- [x] `src/lib/design-icons.ts` — 8 curated `lucide-react` icons (party
      popper, sparkles, flower, moon & star, heart, cake, wine, snowflake)
- [x] DB migration: `events.design_config JSONB`, `kind` CHECK constraint
      gains `'designed_template'`
- [x] `SlotEditor` component (`react-rnd`-based, bounded drag/resize per
      slot) + `DesignedCardContent` (the shared read-only render both the
      editor and the guest page use, so they can't visually drift)
- [x] Template picker + palette/font/icon picker UI — **not** wired into
      `NewInvitationModal` as originally planned; see section 9, it's a
      dedicated page instead
- [x] `POST /api/events` accepts `designed_template` kind + `design_config`
      (server-side `sanitizeDesignConfig` validates/clamps against the fixed
      registries + numeric bounds, same defense-in-depth pattern as the RSVP
      category-count clamp)
- [x] `PUT /api/events/[slug]` accepts `design_config` edits (same
      ownership-gated pattern as other event edits, re-validated through the
      same sanitizer rather than trusted as already-valid)
- [x] `GuestEventView` render branch for `designed_template`
- [x] `EventEditor` support for re-opening/adjusting an existing designed
      card (reuses `SlotEditor`, palette/font/icon pickers inline in the
      existing edit form)
- [x] End-to-end verification in browser: created a designed-template
      invitation (headless Chrome, real drag simulated via CDP mouse
      events), confirmed `design_config` persisted correctly to Postgres,
      published it, and confirmed the guest-facing `/receiver/[slug]` page
      rendered the identical card (same dragged title position, same
      palette/font) with the RSVP form still working below it.
- [x] `npx tsc --noEmit` / `npx eslint .` clean
- [ ] `SYSTEM_MEMORY.md` / `CLAUDE.md` updated once the feature is stable
      (in progress as of this doc update)

## 9. Mid-build UI correction: dedicated page, not a modal step

Section 7/8 originally planned this as a third step inside
`NewInvitationModal` (template → style → content, all within the existing
modal), matching how `BringYourOwnCardForm` works. That version was fully
built and working, but the user stopped it explicitly: **"i don't like how
we're making the custom rsvp. it should have a dedicated page with sidebar
options and the entire thing visible in the right, like canva."**

Reworked to `/create/design`, a real full-page route (not a modal) —
navigated to from the New Invitation modal's "Design in our editor" button
instead of opening a modal step. Layout: a fixed-width left sidebar with
three tabs (Templates / Style / Content, chosen over one long scrolling
panel per direct question to the user) and the live card canvas filling the
entire right side of the viewport, matching a Canva-style workspace rather
than a wizard-in-a-box. The underlying template-constrained-canvas
mechanism (registries, `SlotEditor`, `design_config` shape, sanitization) is
unchanged from section 7 — only the chrome around it changed. The
modal-step version (`DesignInEditorForm.tsx`) was deleted rather than kept
as a second entry point, to avoid two divergent ways to reach the same
feature.

Also renamed `src/middleware.ts` → `src/proxy.ts` during this same session
(unrelated to the designer itself) — Next.js 16 deprecated the
`middleware.ts` convention in favor of `proxy.ts` for the same
request-interception mechanism the localhost-only admin gate uses (see
`SYSTEM_MEMORY.md`'s "Localhost-only admin gate"). Confirmed the rename
didn't change behavior (same localhost-only gating verified from both
localhost and the real LAN IP after the rename) and that this project's
security posture already matched Next's own stated reasoning for the
rename — the proxy layer here only does an IP check, never session/auth
verification, which stays in route handlers as it always did.

## 10. Known limitation — feels bare-bones, needs occasion presets (flagged 2026-07-27, not yet actioned)

User feedback right after the build landed: **"our editor is highly bare
bones, i have no idea why it is the way it is but it lacks so much detail
and so much personality and stuff and we should develop presets for the
occasions as well."** Noted here as a real gap, not fixed yet — a to-do for
the next pass on this feature, not this session's build.

Best read of "why it is the way it is": sections 7/8 deliberately scoped
this first version down to the smallest thing that could prove the
mechanism (drag/resize within guardrails, persisted, rendered identically
for sender and guest) — same staged-scope philosophy as every other feature
in this project. That means the *plumbing* is real (registries, sanitizer,
shared render, live drag) but the *content* of those registries is
intentionally thin: 3 generic layout shapes, 4 palettes, 4 font pairs, 8
icons, none of it organized around an actual occasion. There's no
personality layer at all yet — no per-occasion decorative motifs, no
layout/palette/font bundled together as a single one-click "vibe," nothing
like the reference project's own "Bistro Glaze" treatment that this
project's `CLAUDE.md` has flagged more than once as something to develop an
equivalent of later, just not by copying it outright.

Concretely, what "occasion presets" likely means (not decided, just the
obvious shape given how registries already work): a fifth registry,
`design-presets.ts`, where a preset is a named bundle —
`{name: "Birthday", templateId, paletteId, fontPairId, iconId}` (e.g.
"Birthday" → Photo Hero + Celebration + Playful + Cake/PartyPopper,
"Wedding" → Stationery Frame + Elegant Evening + Editorial +
Heart/MoonStar, "Garden Party" → Centered Stack + Garden + Classic +
Flower). The Templates tab in `/create/design` would offer presets as the
primary picker (one click = template + palette + font + icon all set
correctly for that vibe), with the current three separate
Templates/Style/Content tabs demoted to "customize further" rather than the
only way in — closer to how Greetings Island/Partiful actually work per
section 1's research (pick a themed starting point, not assemble the
pieces yourself). Would need more raw material too: more than 3 layout
templates and more than 4 palette/font options for presets to feel
genuinely differentiated rather than the same handful of parts relabeled.

Not scoped or started. Revisit this section before the next pass on the
designer.

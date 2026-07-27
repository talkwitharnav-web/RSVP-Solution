# Custom RSVP Card Designer — Research

Research-only doc for the "Design in our editor" flow — the disabled/coming-soon
option in `NewInvitationModal.tsx`, sitting alongside `custom_card` (bring-your-own-image,
already built) as the second `EventKind` this project always intended to add. Nothing
in this doc has been implemented; it's the research pass that `SYSTEM_MEMORY.md`'s
"Next Likely Steps" flags as needed before that build starts.

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

None of this has been started. This doc is research/options only.

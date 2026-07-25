# theme.md

Visual identity for the RSVP app: color palette and typography, for both light and dark mode. This was originally a design decision record written before implementation; the color table below now reflects the corrected, implemented palette (see "2026-07-24 correction" below) — see `SYSTEM_MEMORY.md` for what's actually wired into the codebase at any given time.

## Brief

Fun, whimsical, airy — but grown-up. RSVPs on this site cover the full range from a kid's birthday to a wedding to a formal dinner, so the theme needs to read as "delightful invitation," not "children's app" and not "corporate SaaS form." Needs a light mode and a dark mode that both hold that same personality.

## Research summary

Quick web research (2026-07-23) on current whimsical-but-elegant design direction, to avoid picking colors/fonts from vibes alone:

- **Childish vs. whimsical is mostly a saturation/color-choice question, not a shapes question.** High-saturation primary red/yellow/blue reads as kids' app. Desaturated/pastel warm tones (coral, peach, dusty rose, sage, lavender) read as "delightful" without reading as "juvenile" — this shows up consistently across pastel-palette and wedding-color-trend sources.
- **2026 wedding/invitation typography trend is intentional restraint** — a swing back from heavily flourished script fonts toward one characterful display face + one clean, quiet body face. Confirms the "one fun font, one calm font" pairing approach rather than multiple decorative fonts.
- **Bricolage Grotesque** repeatedly came up as the current-feeling "has personality but still reads professional" display/heading face — variable font, slightly wonky/organic letterforms (a distinctive hooked lowercase "f"), used for headings/display rather than body text, pairs commonly with a plain, highly-readable sans for body copy.
- **Dark mode accessibility guidance is specific and consistent**: desaturate colors further for dark backgrounds (~20 points lower saturation than the light-mode equivalent) to avoid "vibration"/eye strain; use a dark warm grey rather than pure black for the base surface (pure black causes halation/legibility issues); WCAG AA requires 4.5:1 contrast for normal text, 3:1 for large text/UI components.

Sources consulted: general Google Fonts pairing roundups (madegooddesigns.com, mantlr.com, fontpair.co, maxibestof.one), wedding typography trend pieces (paperlust.co, thedenizenco.com), pastel palette roundups (icons8.com, higocreative.com, kdesign.co), and dark-mode accessibility guides (themeandcolor.com, accessibilitychecker.org, dubbot.com).

## Decision

### Typography

| Role | Font | Why |
|---|---|---|
| Display / headings | **Bricolage Grotesque** (variable, Google Fonts) | Has real personality — an organic, slightly wonky quality — without tipping into cartoonish. Reads as design-aware/current, not "kids' font." Use its display-leaning weights/optical sizes for event titles, page headings, and the RSVP confirmation moment. |
| Body / UI text | **Plus Jakarta Sans** (Google Fonts) | Clean and highly readable like Inter, but warmer and friendlier — better fit for an invitation-adjacent product than a strictly neutral/corporate sans. Used for all form labels, body copy, buttons, nav. |
| Monospace | *(none)* | No code/data display in this app (unlike the reference project's admin DB views) — a mono face isn't needed. Revisit only if a future admin/debug view needs one. |

Both are available as normal npm-installable Google Fonts (`next/font/google`), same mechanism already used for the scaffolded app's placeholder Geist fonts — swapping them in is a straightforward `layout.tsx` change when we get to implementation.

**Usage rule:** exactly two type families, matching the "intentional restraint" trend finding above. Display face for anything that should feel like a moment (event title, "You're invited," confirmation message); body face for everything functional (forms, buttons, nav, fine print). Don't introduce a third decorative face even for small flourishes — if something needs more personality, lean on the display face's own weight/size range instead.

### Color palette

Real hue-driven base (bright pink-blush in light mode, deep plum/wine in dark mode — never pure white/black or a neutral grey-with-a-whisper-of-tint) with one primary accent (coral) for anything celebratory/actionable, and two secondary accents (sage, lavender) for variety across different event moods — sage reads a little more relaxed/garden-party, lavender a little more elegant/formal, so template builders naturally get some range without the app needing multiple full themes.

All pairs below are verified against WCAG 2.1 contrast math (not eyeballed) — ratios computed directly, not assumed from the hex values.

**2026-07-24 correction:** the original palette below (cream/charcoal backgrounds, `#E4633F` coral) shipped as originally decided, but the user caught two problems once real UI existed to look at: (1) `#E4633F`/`#B8431F` are mathematically orange (R channel far above G), not coral-pink, and the built app visually read as indistinguishable from the reference project's own burnt-orange brand color — RGB-diffed, `#1E1B19`/`#2A2522` backgrounds were within a few points per channel of the reference's own `#211a15`/`#2b221c` dark surfaces despite being different hex digits; (2) sage and lavender were defined as CSS variables but zero components ever referenced them, so the shipped UI was coral-only regardless of what the token table said. Explicit instruction: "i don't want anything resembling orange, remember the purpose of this rsvp website" and backgrounds should carry real saturated hue rather than staying neutral ("red is a dark color right? vs say pink, which tends to be a brighter color"). The table below is the corrected, currently-implemented palette — the hex values in `globals.css` are the source of truth if this table ever drifts.

#### Light mode

| Token | Hex | Role | Contrast vs. bg-base |
|---|---|---|---|
| `--color-bg-base` | `#FDF2F5` | Page background (bright pink-blush, real hue not neutral cream) | — |
| `--color-bg-raised` | `#FFFFFF` | Cards/panels sitting above the base | — |
| `--color-text-primary` | `#2B2521` | Body text, headings | 13.82:1 |
| `--color-text-muted` | `#6B6259` | Secondary text, timestamps, help text | 5.46:1 |
| `--color-accent-coral` | `#F0554F` | Decorative/large use only (icons, illustrations, large headings ≥24px) — NOT for small text or button labels. True coral-pink hue (R and B both well above G), not orange. | 3.19:1 (passes large-text/UI-component AA only) |
| `--color-accent-coral-text` | `#C42E3D` | Coral used as small text or a button's own label size | 5.13:1 |
| `--color-on-coral` | `#FFFFFF` | Text/icons on a solid coral button fill (pair with `coral-text` as the fill, not `accent-coral`) | 3.43:1 vs `#F0554F` fill |
| `--color-accent-sage` | `#4F6B4C` | Secondary accent — text/icon use; also drives "on" states (UI size toggle, accessibility toggles) | 5.42:1 |
| `--color-on-sage` | `#FFFFFF` | Text/icons on a solid sage fill | 5.93:1 vs sage fill |
| `--color-accent-lavender` | `#69579C` | Secondary accent — text/icon use; also drives selection state (CVD palette radio) and the wordmark/Access DB icon | 5.57:1 |
| `--color-on-lavender` | `#FFFFFF` | Text/icons on a solid lavender fill | 6.10:1 vs lavender fill |
| `--color-border` | `#F0D9E1` | Hairlines, input borders | — (non-text, decorative) |
| `--color-danger` | `#B3261E` | Errors, validation | 5.97:1 (deliberately a clearly separate crimson, not the same family as coral — shifted further 2026-07-24 so it doesn't read as "a shade of the brand color") |

#### Dark mode

| Token | Hex | Role | Contrast vs. bg-base |
|---|---|---|---|
| `--color-bg-base` | `#241827` | Page background (deep plum/wine, real saturated dark hue not neutral-brown-with-a-whisper-of-tint) | — |
| `--color-bg-raised` | `#331F37` | Cards/panels sitting above the base | — |
| `--color-text-primary` | `#F3ECE3` | Body text, headings | 14.51:1 |
| `--color-text-muted` | `#B7ADA2` | Secondary text, timestamps, help text | 7.70:1 |
| `--color-accent-coral` | `#FF8B7E` | Coral for both decorative AND text use in dark mode — desaturated/lightened enough that it clears AA even at text sizes, unlike light mode. Shifted pink-red like the light-mode value, not the old peachy-orange `#F0916F`. | 7.49:1 |
| `--color-on-coral` | `#3D0F12` | Text/icons on a solid coral button fill | 7.25:1 vs coral fill |
| `--color-accent-sage` | `#9BC198` | Secondary accent | 8.48:1 |
| `--color-on-sage` | `#16301A` | Text/icons on a solid sage fill — dark mode's lightened sage fails contrast against white text, needs dark text instead | 7.12:1 vs sage fill |
| `--color-accent-lavender` | `#B9A8E0` | Secondary accent | 7.89:1 |
| `--color-on-lavender` | `#241C3D` | Text/icons on a solid lavender fill — same "dark fill needs dark text" reasoning as on-sage | 7.44:1 vs lavender fill |
| `--color-border` | `#4A3350` | Hairlines, input borders | — |
| `--color-danger` | `#FF6B5E` | Errors, validation | 6.09:1 |

**Why dark mode only needs one coral token, not two:** the accessibility research point about desaturating/lightening for dark backgrounds means the dark-mode coral is already light enough to double as both decorative and text color — light mode's coral had to split into two tokens (a punchier decorative shade and a darker text-safe shade) specifically because the vivid version fails AA at text sizes on a light background.

**Why sage/lavender need `on-*` tokens in dark mode but light mode reuses white:** dark mode's sage/lavender are already lightened (per the same desaturate-for-dark-backgrounds rule as coral), which means white text on top of them fails AA (sage vs. white is only 2.00:1) — they need a dark, same-hue-family text color instead, mirroring `on-coral`'s existing pattern. Light mode's sage/lavender are dark enough that white text on top already clears AA, so no separate token was needed there.

### How this maps to implementation (when we get there)

- Follow the reference project's own established pattern: CSS custom properties (`--color-*`) defined once per theme, never literal Tailwind color utility classes in components — keeps light/dark (and any future accessibility variants) swappable from one place.
- `prefers-color-scheme` for the default, with a manual override toggle (same shape as most theme toggles) — not scoped in detail yet, just noting the mechanism isn't novel.
- Radii/shapes: lean rounded (soft pill buttons, rounded cards) to reinforce "airy/whimsical" — not scoped with exact values yet, this file is colors/type only per the current ask.
- Accessibility axes (high contrast, reduced motion, CVD palettes) are out of scope for this file — revisit as a separate pass once the base theme is implemented and there's real UI to test against, same staged-scope approach as the rest of this project.

## Explicitly rejected directions

- **Multiple bright saturated colors ("confetti" palette)** — this is exactly what tips whimsical into childish per the research; one clear accent plus two supporting accents reads more considered.
- **A script/handwritten display font** — reads as "kids' birthday invite" or "rustic wedding cliché" almost immediately; Bricolage Grotesque's organic-but-structured personality gets "fun" across without that association.
- **Pure white / pure black surfaces** — flattens the "warm" half of the brief and (for dark mode specifically) is a real accessibility miss per the halation/eye-strain research above.

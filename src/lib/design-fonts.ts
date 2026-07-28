/**
 * Curated font-pair presets for the "designed_template" invitation designer.
 * next/font/google resolves/subsets fonts at build time, so these are
 * statically imported once in src/app/layout.tsx (not loaded dynamically per
 * sender choice -- see "custom rsvp card designer.md" section 4 for why that
 * isn't supported) and exposed as CSS variables there. This registry just
 * maps a stable id to the display/body variable pair a template should use.
 *
 * 30 pairs across moods so presets feel genuinely distinct rather than the
 * same handful of parts relabeled (expanded from the original 4, 2026-07-28).
 * `mood` is advisory grouping for the picker UI; `scriptCaution` flags pairs
 * whose display font is dense/decorative enough that using it for more than
 * a short title hurts readability -- advisory only, not enforced.
 */
export type DesignFontMood =
  | "signature"
  | "editorial"
  | "script"
  | "playful"
  | "elegant"
  | "modern"
  | "seasonal";

export type DesignFontPair = {
  id: string;
  name: string;
  mood: DesignFontMood;
  displayVar: string;
  bodyVar: string;
  scriptCaution?: boolean;
};

export const DESIGN_FONT_PAIRS: DesignFontPair[] = [
  {
    id: "signature",
    name: "Signature (this app's own fonts)",
    mood: "signature",
    displayVar: "var(--font-display)",
    bodyVar: "var(--font-body)",
  },
  // Editorial / serif
  {
    id: "editorial",
    name: "Editorial",
    mood: "editorial",
    displayVar: "var(--font-design-editorial-display)",
    bodyVar: "var(--font-design-editorial-body)",
  },
  {
    id: "classic",
    name: "Classic",
    mood: "editorial",
    displayVar: "var(--font-design-classic-display)",
    bodyVar: "var(--font-design-classic-body)",
  },
  {
    id: "garamond-montserrat",
    name: "Garamond & Montserrat",
    mood: "editorial",
    displayVar: "var(--font-design-garamond-display)",
    bodyVar: "var(--font-design-garamond-body)",
  },
  {
    id: "crimson-raleway",
    name: "Crimson & Raleway",
    mood: "editorial",
    displayVar: "var(--font-design-crimson-display)",
    bodyVar: "var(--font-design-crimson-body)",
  },
  {
    id: "libre-source",
    name: "Libre Caslon & Source Sans",
    mood: "editorial",
    displayVar: "var(--font-design-librecaslon-display)",
    bodyVar: "var(--font-design-librecaslon-body)",
  },
  // Script / casual
  {
    id: "playful",
    name: "Playful",
    mood: "script",
    displayVar: "var(--font-design-playful-display)",
    bodyVar: "var(--font-design-playful-body)",
    scriptCaution: true,
  },
  {
    id: "dancing-lato",
    name: "Dancing Script & Lato",
    mood: "script",
    displayVar: "var(--font-design-dancing-display)",
    bodyVar: "var(--font-design-dancing-body)",
    scriptCaution: true,
  },
  {
    id: "allura-jakarta",
    name: "Allura & Plus Jakarta Sans",
    mood: "script",
    displayVar: "var(--font-design-allura-display)",
    bodyVar: "var(--font-design-allura-body)",
    scriptCaution: true,
  },
  {
    id: "alexbrush-nunito",
    name: "Alex Brush & Nunito Sans",
    mood: "script",
    displayVar: "var(--font-design-alexbrush-display)",
    bodyVar: "var(--font-design-alexbrush-body)",
    scriptCaution: true,
  },
  {
    id: "greatvibes-mulish",
    name: "Great Vibes & Mulish",
    mood: "script",
    displayVar: "var(--font-design-greatvibes-display)",
    bodyVar: "var(--font-design-greatvibes-body)",
    scriptCaution: true,
  },
  {
    id: "parisienne-karla",
    name: "Parisienne & Karla",
    mood: "script",
    displayVar: "var(--font-design-parisienne-display)",
    bodyVar: "var(--font-design-parisienne-body)",
    scriptCaution: true,
  },
  // Playful / fun
  {
    id: "pacifico-quicksand",
    name: "Pacifico & Quicksand",
    mood: "playful",
    displayVar: "var(--font-design-pacifico-display)",
    bodyVar: "var(--font-design-pacifico-body)",
    scriptCaution: true,
  },
  {
    id: "baloo-nunito",
    name: "Baloo 2 & Nunito",
    mood: "playful",
    displayVar: "var(--font-design-baloo-display)",
    bodyVar: "var(--font-design-baloo-body)",
  },
  {
    id: "fredoka-comfortaa",
    name: "Fredoka & Comfortaa",
    mood: "playful",
    displayVar: "var(--font-design-fredoka-display)",
    bodyVar: "var(--font-design-fredoka-body)",
  },
  {
    id: "luckiestguy-poppins",
    name: "Luckiest Guy & Poppins",
    mood: "playful",
    displayVar: "var(--font-design-luckiestguy-display)",
    bodyVar: "var(--font-design-luckiestguy-body)",
    scriptCaution: true,
  },
  {
    id: "bungee-worksans",
    name: "Bungee & Work Sans",
    mood: "playful",
    displayVar: "var(--font-design-bungee-display)",
    bodyVar: "var(--font-design-bungee-body)",
    scriptCaution: true,
  },
  // Elegant / formal
  {
    id: "evening",
    name: "Elegant Evening",
    mood: "elegant",
    displayVar: "var(--font-design-evening-display)",
    bodyVar: "var(--font-design-evening-body)",
  },
  {
    id: "cormorant-jost",
    name: "Cormorant Garamond & Jost",
    mood: "elegant",
    displayVar: "var(--font-design-cormorant-display)",
    bodyVar: "var(--font-design-cormorant-body)",
  },
  {
    id: "abril-lora",
    name: "Abril Fatface & Lora",
    mood: "elegant",
    displayVar: "var(--font-design-abril-display)",
    bodyVar: "var(--font-design-abril-body)",
  },
  {
    id: "cinzel-eb",
    name: "Cinzel & EB Garamond",
    mood: "elegant",
    displayVar: "var(--font-design-cinzel-display)",
    bodyVar: "var(--font-design-cinzel-body)",
  },
  {
    id: "marcellus-poppins",
    name: "Marcellus & Poppins",
    mood: "elegant",
    displayVar: "var(--font-design-marcellus-display)",
    bodyVar: "var(--font-design-marcellus-body)",
  },
  {
    id: "prata-mulish",
    name: "Prata & Mulish",
    mood: "elegant",
    displayVar: "var(--font-design-prata-display)",
    bodyVar: "var(--font-design-prata-body)",
  },
  // Modern / clean
  {
    id: "spacegrotesk-ibm",
    name: "Space Grotesk & IBM Plex Sans",
    mood: "modern",
    displayVar: "var(--font-design-spacegrotesk-display)",
    bodyVar: "var(--font-design-spacegrotesk-body)",
  },
  {
    id: "sora-manrope",
    name: "Sora & Manrope",
    mood: "modern",
    displayVar: "var(--font-design-sora-display)",
    bodyVar: "var(--font-design-sora-body)",
  },
  {
    id: "outfit-figtree",
    name: "Outfit & Figtree",
    mood: "modern",
    displayVar: "var(--font-design-outfit-display)",
    bodyVar: "var(--font-design-outfit-body)",
  },
  {
    id: "unbounded-dmsans",
    name: "Unbounded & DM Sans",
    mood: "modern",
    displayVar: "var(--font-design-unbounded-display)",
    bodyVar: "var(--font-design-unbounded-body)",
  },
  // Seasonal / thematic
  {
    id: "amaticsc-worksans",
    name: "Amatic SC & Work Sans",
    mood: "seasonal",
    displayVar: "var(--font-design-amaticsc-display)",
    bodyVar: "var(--font-design-amaticsc-body)",
    scriptCaution: true,
  },
  {
    id: "berkshire-nunito",
    name: "Berkshire Swash & Nunito",
    mood: "seasonal",
    displayVar: "var(--font-design-berkshire-display)",
    bodyVar: "var(--font-design-berkshire-body)",
    scriptCaution: true,
  },
  {
    id: "philosopher-karla",
    name: "Philosopher & Karla",
    mood: "seasonal",
    displayVar: "var(--font-design-philosopher-display)",
    bodyVar: "var(--font-design-philosopher-body)",
  },
];

export function getDesignFontPair(id: string): DesignFontPair {
  return DESIGN_FONT_PAIRS.find((f) => f.id === id) ?? DESIGN_FONT_PAIRS[0];
}

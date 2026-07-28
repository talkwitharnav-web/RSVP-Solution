/**
 * Curated font-pair presets for the "designed_template" invitation designer.
 * next/font/google resolves/subsets fonts at build time, so these are
 * statically imported once in src/app/layout.tsx (not loaded dynamically per
 * sender choice -- see "custom rsvp card designer.md" section 4 for why that
 * isn't supported) and exposed as CSS variables there. This registry just
 * maps a stable id to the display/body variable pair a template should use.
 */
export type DesignFontPair = {
  id: string;
  name: string;
  displayVar: string;
  bodyVar: string;
};

export const DESIGN_FONT_PAIRS: DesignFontPair[] = [
  {
    id: "signature",
    name: "Signature (this app's own fonts)",
    displayVar: "var(--font-display)",
    bodyVar: "var(--font-body)",
  },
  {
    id: "editorial",
    name: "Editorial",
    displayVar: "var(--font-design-editorial-display)",
    bodyVar: "var(--font-design-editorial-body)",
  },
  {
    id: "classic",
    name: "Classic",
    displayVar: "var(--font-design-classic-display)",
    bodyVar: "var(--font-design-classic-body)",
  },
  {
    id: "playful",
    name: "Playful",
    displayVar: "var(--font-design-playful-display)",
    bodyVar: "var(--font-design-playful-body)",
  },
];

export function getDesignFontPair(id: string): DesignFontPair {
  return DESIGN_FONT_PAIRS.find((f) => f.id === id) ?? DESIGN_FONT_PAIRS[0];
}

import type { DesignColors } from "@/lib/design-types";

/**
 * Quick-pick color presets for the "designed_template" invitation designer
 * -- a starting point a sender can click to fill all five color roles at
 * once, not the only option. Colors are fully open (see ColorField /
 * sanitizeDesignConfig) per explicit user feedback that four fixed named
 * themes felt uncreative/limiting, and that "Celebration" in particular
 * (a yellow/brown pairing) read badly. These presets lean into more
 * saturated, distinct hues instead of the earlier muted four, and every
 * pairing is still checked for real WCAG 2.1 contrast (background/text
 * 4.5:1+, onAccent/accent 4.5:1+) -- a starting point should never hand a
 * sender an illegible card, even though nothing stops them from picking
 * their own combination afterward.
 */
export type DesignPalette = {
  id: string;
  name: string;
  /**
   * Font pairs that suit this palette's mood, surfaced as a "Suggested for
   * <palette>" shortlist above the full 30-pair picker. Advisory only --
   * every pair stays selectable, this just gives a starting point instead of
   * making the sender scan the whole list to find something that fits.
   * Ids must exist in DESIGN_FONT_PAIRS.
   */
  suggestedFontPairIds: string[];
} & DesignColors;

export const DESIGN_PALETTES: DesignPalette[] = [
  {
    id: "garden",
    name: "Garden",
    background: "#F1F7EC",
    text: "#243B22",
    textMuted: "#4C6B48",
    accent: "#3E6B33",
    onAccent: "#FFFFFF",
    suggestedFontPairIds: ["garamond-montserrat", "philosopher-karla", "parisienne-karla"],
  },
  {
    id: "sunset",
    name: "Sunset",
    background: "#FFF0E6",
    text: "#3D1F12",
    textMuted: "#7A4A2E",
    accent: "#E8501F",
    onAccent: "#FFFFFF",
    suggestedFontPairIds: ["pacifico-quicksand", "amaticsc-worksans", "outfit-figtree"],
  },
  {
    id: "evening",
    name: "Elegant Evening",
    background: "#EFE9F7",
    text: "#241A38",
    textMuted: "#5A4C74",
    accent: "#5B4590",
    onAccent: "#FFFFFF",
    suggestedFontPairIds: ["cinzel-eb", "cormorant-jost", "greatvibes-mulish"],
  },
  {
    id: "classic",
    name: "Classic Red",
    background: "#FDF2F5",
    text: "#2B2521",
    textMuted: "#6B6259",
    accent: "#C42E3D",
    onAccent: "#FFFFFF",
    suggestedFontPairIds: ["signature", "editorial", "marcellus-poppins"],
  },
  {
    id: "ocean",
    name: "Ocean",
    background: "#E9F5F7",
    text: "#0F2E33",
    textMuted: "#3E6A70",
    accent: "#0B7A8C",
    onAccent: "#FFFFFF",
    suggestedFontPairIds: ["spacegrotesk-ibm", "sora-manrope", "libre-source"],
  },
  {
    id: "berry",
    name: "Berry",
    background: "#FBE9F2",
    text: "#3A0F26",
    textMuted: "#7A3D5C",
    accent: "#B0246E",
    onAccent: "#FFFFFF",
    suggestedFontPairIds: ["dancing-lato", "allura-jakarta", "prata-mulish"],
  },
  {
    id: "midnight",
    name: "Midnight",
    background: "#1B1830",
    text: "#F2EEFB",
    textMuted: "#B6ADD6",
    accent: "#8B7CF6",
    onAccent: "#1B1830",
    suggestedFontPairIds: ["unbounded-dmsans", "bungee-worksans", "abril-lora"],
  },
  {
    id: "citrus",
    name: "Citrus",
    background: "#FFF9E3",
    text: "#33280A",
    textMuted: "#6E5A1E",
    accent: "#C98A00",
    onAccent: "#FFFFFF",
    suggestedFontPairIds: ["fredoka-comfortaa", "baloo-nunito", "luckiestguy-poppins"],
  },
];

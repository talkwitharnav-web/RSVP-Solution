/**
 * Curated color palettes for the "designed_template" invitation designer.
 * Fixed, in-code list -- not user-authorable (a free hex-code picker would
 * make the WCAG guarantees below meaningless, since a sender could pick any
 * combination). Each pair below was checked with real WCAG 2.1 contrast
 * math (not eyeballed), the same standard theme.md holds this project's own
 * palette to: 4.5:1 minimum for both "accent used as text" and "white text
 * on a solid accent fill", body text against its background comfortably
 * clears 11:1+ in every case. The dataviz skill's validator script isn't
 * vendored into this repo, so these were verified with a one-off contrast
 * calculation instead of that tool -- same bar, different mechanism.
 */
export type DesignPalette = {
  id: string;
  name: string;
  background: string;
  text: string;
  textMuted: string;
  accent: string;
  onAccent: string;
};

export const DESIGN_PALETTES: DesignPalette[] = [
  {
    id: "garden",
    name: "Garden",
    background: "#F1F7EC",
    text: "#243B22",
    textMuted: "#4C6B48",
    accent: "#3E6B33",
    onAccent: "#FFFFFF",
  },
  {
    id: "celebration",
    name: "Celebration",
    background: "#FFF6E8",
    text: "#3A2A12",
    textMuted: "#7A5C33",
    accent: "#A34F0A",
    onAccent: "#FFFFFF",
  },
  {
    id: "evening",
    name: "Elegant Evening",
    background: "#EFE9F7",
    text: "#241A38",
    textMuted: "#5A4C74",
    accent: "#5B4590",
    onAccent: "#FFFFFF",
  },
  {
    id: "classic",
    name: "Classic",
    background: "#FDF2F5",
    text: "#2B2521",
    textMuted: "#6B6259",
    accent: "#C42E3D",
    onAccent: "#FFFFFF",
  },
];

export function getDesignPalette(id: string): DesignPalette {
  return DESIGN_PALETTES.find((p) => p.id === id) ?? DESIGN_PALETTES[0];
}

import type { DesignColors } from "@/lib/design-types";
import type { DesignFontRole } from "@/lib/design-fonts";

/**
 * Occasion starting points for the designed-template editor.
 *
 * Every commercial invitation tool researched in "custom rsvp card
 * designer.md" section 1 steers people to "pick an occasion, then nudge it"
 * rather than "assemble a card from an empty canvas" -- this is that missing
 * first step. Applying a template replaces the canvas contents and sets the
 * card's colours and font pair in one go; everything it produces is an
 * ordinary Fabric object afterwards, so nothing here is locked or special.
 *
 * Templates are declared as positioned *elements* rather than raw Fabric
 * scene JSON on purpose: hand-maintaining serialized Fabric objects is
 * brittle across library versions, and building through the same add-path
 * the editor already uses means templates can never drift from how a
 * manually-built card behaves. Positions are percentages of the card so a
 * template stays correct at any canvas size.
 *
 * Colours reference the card's own five roles rather than hardcoded hex, so
 * a sender who then swaps palette gets a coherent card instead of a template
 * with baked-in colours fighting their choice.
 */

export type TemplateColorRole = keyof Pick<DesignColors, "text" | "textMuted" | "accent">;

export type TemplateElement =
  | {
      kind: "text";
      text: string;
      role: DesignFontRole;
      /** Percent of card width/height, measuring the element's centre. */
      xPct: number;
      yPct: number;
      /** Percent of card width -- converted to px so type scales with the card. */
      fontSizePct: number;
      color: TemplateColorRole;
      bold?: boolean;
      italic?: boolean;
      uppercase?: boolean;
      letterSpacing?: number;
    }
  | { kind: "icon"; iconId: string; xPct: number; yPct: number; scale: number }
  | { kind: "decoration"; decorationId: string; xPct: number; yPct: number; scale: number };

export type DesignTemplate = {
  id: string;
  name: string;
  description: string;
  /** Preset colours applied alongside the layout. */
  colors: DesignColors;
  fontPairId: string;
  elements: TemplateElement[];
};

export const DESIGN_TEMPLATES: DesignTemplate[] = [
  {
    id: "birthday",
    name: "Birthday",
    description: "Bright and celebratory, with confetti and a big age-friendly headline.",
    fontPairId: "fredoka-comfortaa",
    colors: {
      background: "#FFF6E5",
      text: "#3A2410",
      textMuted: "#7A5A2E",
      accent: "#E8501F",
      onAccent: "#FFFFFF",
    },
    elements: [
      { kind: "decoration", decorationId: "confetti-burst", xPct: 22, yPct: 16, scale: 1.6 },
      { kind: "decoration", decorationId: "confetti-burst", xPct: 78, yPct: 16, scale: 1.6 },
      { kind: "text", text: "IT'S A PARTY", role: "body", xPct: 50, yPct: 30, fontSizePct: 3.4, color: "accent", uppercase: true, letterSpacing: 250 },
      { kind: "text", text: "Ava turns 30", role: "display", xPct: 50, yPct: 41, fontSizePct: 9.5, color: "text", bold: true },
      { kind: "icon", iconId: "cake", xPct: 50, yPct: 55, scale: 3.4 },
      { kind: "text", text: "Saturday 14 June · 7pm", role: "body", xPct: 50, yPct: 69, fontSizePct: 3.8, color: "text" },
      { kind: "text", text: "18 Rosewood Avenue", role: "body", xPct: 50, yPct: 75, fontSizePct: 3.2, color: "textMuted" },
      { kind: "text", text: "Cake, music and questionable dancing", role: "body", xPct: 50, yPct: 85, fontSizePct: 2.8, color: "textMuted", italic: true },
    ],
  },
  {
    id: "wedding",
    name: "Wedding",
    description: "Quiet and elegant — serif headline, generous space, a single flourish.",
    fontPairId: "cinzel-eb",
    colors: {
      background: "#F7F4EE",
      text: "#2A2620",
      textMuted: "#6B6357",
      accent: "#8A7A52",
      onAccent: "#FFFFFF",
    },
    elements: [
      { kind: "text", text: "TOGETHER WITH THEIR FAMILIES", role: "body", xPct: 50, yPct: 17, fontSizePct: 2.4, color: "textMuted", uppercase: true, letterSpacing: 300 },
      { kind: "text", text: "Amelia", role: "display", xPct: 50, yPct: 31, fontSizePct: 9, color: "text" },
      { kind: "text", text: "and", role: "body", xPct: 50, yPct: 40, fontSizePct: 3.2, color: "accent", italic: true },
      { kind: "text", text: "Daniel", role: "display", xPct: 50, yPct: 49, fontSizePct: 9, color: "text" },
      { kind: "decoration", decorationId: "flourish", xPct: 50, yPct: 59, scale: 1.5 },
      { kind: "text", text: "request the pleasure of your company", role: "body", xPct: 50, yPct: 68, fontSizePct: 2.8, color: "textMuted" },
      { kind: "text", text: "SATURDAY, 12 SEPTEMBER", role: "body", xPct: 50, yPct: 77, fontSizePct: 3, color: "text", uppercase: true, letterSpacing: 200 },
      { kind: "text", text: "Thornbury Hall, Somerset", role: "body", xPct: 50, yPct: 84, fontSizePct: 2.8, color: "textMuted" },
    ],
  },
  {
    id: "formal",
    name: "Formal Event",
    description: "Restrained and corporate-friendly — structured type, no ornament.",
    fontPairId: "marcellus-poppins",
    colors: {
      background: "#121A2B",
      text: "#F3F5FA",
      textMuted: "#A9B4CC",
      accent: "#C9A227",
      onAccent: "#121A2B",
    },
    elements: [
      { kind: "text", text: "YOU ARE CORDIALLY INVITED", role: "body", xPct: 50, yPct: 20, fontSizePct: 2.4, color: "accent", uppercase: true, letterSpacing: 350 },
      { kind: "text", text: "The Annual Gala Dinner", role: "display", xPct: 50, yPct: 34, fontSizePct: 7, color: "text" },
      { kind: "icon", iconId: "wine", xPct: 50, yPct: 48, scale: 2.6 },
      { kind: "text", text: "THURSDAY 20 NOVEMBER · 7:00 PM", role: "body", xPct: 50, yPct: 62, fontSizePct: 2.6, color: "text", uppercase: true, letterSpacing: 150 },
      { kind: "text", text: "The Waldorf, Aldwych, London", role: "body", xPct: 50, yPct: 69, fontSizePct: 2.6, color: "textMuted" },
      { kind: "text", text: "Black tie · Carriages at midnight", role: "body", xPct: 50, yPct: 80, fontSizePct: 2.4, color: "textMuted" },
    ],
  },
  {
    id: "party",
    name: "Party",
    description: "Loud and graphic — oversized headline, high-contrast colour, sparkles.",
    fontPairId: "bungee-worksans",
    colors: {
      background: "#1B1830",
      text: "#F7F3FF",
      textMuted: "#B9AEDC",
      accent: "#FF5FA2",
      onAccent: "#1B1830",
    },
    elements: [
      { kind: "decoration", decorationId: "sparkle-cluster", xPct: 18, yPct: 20, scale: 1.3 },
      { kind: "decoration", decorationId: "sparkle-cluster", xPct: 82, yPct: 78, scale: 1.3 },
      { kind: "text", text: "BIG NIGHT", role: "display", xPct: 50, yPct: 33, fontSizePct: 11, color: "accent" },
      { kind: "text", text: "OUT", role: "display", xPct: 50, yPct: 47, fontSizePct: 11, color: "text" },
      { kind: "icon", iconId: "party-popper", xPct: 50, yPct: 60, scale: 3 },
      { kind: "text", text: "FRI 22 AUG · 9PM TILL LATE", role: "body", xPct: 50, yPct: 73, fontSizePct: 3, color: "text", uppercase: true, letterSpacing: 150 },
      { kind: "text", text: "The Basement, 4 Ship Street", role: "body", xPct: 50, yPct: 81, fontSizePct: 2.8, color: "textMuted" },
    ],
  },
  {
    id: "informal",
    name: "Informal Get-together",
    description: "Relaxed and handwritten — for dinners, picnics and drop-in afternoons.",
    fontPairId: "amaticsc-worksans",
    colors: {
      background: "#F2F7EF",
      text: "#26331F",
      textMuted: "#596B4F",
      accent: "#4F8A3D",
      onAccent: "#FFFFFF",
    },
    elements: [
      { kind: "icon", iconId: "leaf", xPct: 50, yPct: 17, scale: 2.4 },
      { kind: "text", text: "come round for", role: "body", xPct: 50, yPct: 29, fontSizePct: 3, color: "textMuted", italic: true },
      { kind: "text", text: "Sunday Lunch", role: "display", xPct: 50, yPct: 40, fontSizePct: 10, color: "text" },
      { kind: "text", text: "no fuss, just food", role: "body", xPct: 50, yPct: 50, fontSizePct: 3, color: "accent", italic: true },
      { kind: "decoration", decorationId: "dotted-corner", xPct: 50, yPct: 60, scale: 1.1 },
      { kind: "text", text: "Sunday 9 March · from 1pm", role: "body", xPct: 50, yPct: 72, fontSizePct: 3.2, color: "text" },
      { kind: "text", text: "Ours — you know the way", role: "body", xPct: 50, yPct: 79, fontSizePct: 2.8, color: "textMuted" },
      { kind: "text", text: "Bring nothing. Seriously.", role: "body", xPct: 50, yPct: 88, fontSizePct: 2.6, color: "textMuted", italic: true },
    ],
  },
];

export function getDesignTemplate(id: string): DesignTemplate | undefined {
  return DESIGN_TEMPLATES.find((t) => t.id === id);
}

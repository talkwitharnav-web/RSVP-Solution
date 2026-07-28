import type { SlotOffset } from "./design-types";

/**
 * A template defines a fixed set of named slots and, for each, the default
 * bounding box it starts at -- expressed as percentages of the card's own
 * width/height (a 0-100 scale, not pixels), so the same template renders
 * correctly at any card size (the editor's preview, the guest page, a future
 * share-image export) without recalculating anything. `w`/`h` are also
 * percentages; a slot's rendered size is its own `w`/`h` times the sender's
 * chosen `scale` (default 1).
 *
 * Slot kinds are deliberately narrow -- "title", "subtitle", "photo", "icon"
 * -- matching section 3 of the research doc's "what elements does a card
 * actually need" list. A sender can move/resize an existing slot within the
 * template's safeArea; they can't add, delete, or rotate slots. That's the
 * guardrail that keeps this a "template-constrained canvas" rather than a
 * freeform one.
 */
export type SlotKind = "title" | "subtitle" | "date" | "location" | "description" | "photo" | "icon";

export type SlotDefault = SlotOffset & { w: number; h: number; kind: SlotKind };

export type DesignTemplate = {
  id: string;
  name: string;
  description: string;
  /** Percent-based bounding box every slot must stay within, {x,y,w,h}. */
  safeArea: { x: number; y: number; w: number; h: number };
  slots: Record<string, SlotDefault>;
};

// Three layout shapes, matching section 3/7's recommendation to start with a
// small fixed set rather than an open-ended layout system:
export const DESIGN_TEMPLATES: DesignTemplate[] = [
  {
    id: "centered-stack",
    name: "Centered Stack",
    description: "Title, details, and an optional icon stacked and centered — clean and simple.",
    safeArea: { x: 4, y: 4, w: 92, h: 92 },
    slots: {
      icon: { kind: "icon", x: 42, y: 6, w: 16, h: 16, scale: 1 },
      title: { kind: "title", x: 10, y: 26, w: 80, h: 16, scale: 1 },
      subtitle: { kind: "subtitle", x: 15, y: 44, w: 70, h: 8, scale: 1 },
      date: { kind: "date", x: 15, y: 54, w: 70, h: 7, scale: 1 },
      location: { kind: "location", x: 15, y: 63, w: 70, h: 7, scale: 1 },
      description: { kind: "description", x: 12, y: 74, w: 76, h: 18, scale: 1 },
    },
  },
  {
    id: "photo-hero",
    name: "Photo Hero",
    description: "A photo up top with the details below — works with or without an uploaded image.",
    safeArea: { x: 4, y: 4, w: 92, h: 92 },
    slots: {
      photo: { kind: "photo", x: 8, y: 4, w: 84, h: 42, scale: 1 },
      title: { kind: "title", x: 8, y: 50, w: 84, h: 14, scale: 1 },
      subtitle: { kind: "subtitle", x: 8, y: 65, w: 84, h: 7, scale: 1 },
      date: { kind: "date", x: 8, y: 73, w: 40, h: 7, scale: 1 },
      location: { kind: "location", x: 50, y: 73, w: 42, h: 7, scale: 1 },
      description: { kind: "description", x: 8, y: 82, w: 84, h: 14, scale: 1 },
    },
  },
  {
    id: "stationery-frame",
    name: "Stationery Frame",
    description: "A bordered, formal-invitation feel with the title front and center.",
    safeArea: { x: 8, y: 8, w: 84, h: 84 },
    slots: {
      icon: { kind: "icon", x: 44, y: 10, w: 12, h: 12, scale: 1 },
      title: { kind: "title", x: 14, y: 26, w: 72, h: 18, scale: 1 },
      subtitle: { kind: "subtitle", x: 18, y: 46, w: 64, h: 7, scale: 1 },
      date: { kind: "date", x: 18, y: 56, w: 64, h: 7, scale: 1 },
      location: { kind: "location", x: 18, y: 65, w: 64, h: 7, scale: 1 },
      description: { kind: "description", x: 16, y: 76, w: 68, h: 14, scale: 1 },
    },
  },
];

export function getDesignTemplate(id: string): DesignTemplate {
  return DESIGN_TEMPLATES.find((t) => t.id === id) ?? DESIGN_TEMPLATES[0];
}

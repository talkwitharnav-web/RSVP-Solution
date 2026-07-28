/**
 * Shared types for the "designed_template" EventKind -- the template-
 * constrained-canvas invitation designer. See "custom rsvp card designer.md"
 * (section 7) for the full research/decision writeup behind this shape.
 */

export type SlotOffset = { x: number; y: number; scale: number };

/**
 * Per-event design choices. Stored as-is in events.design_config (JSONB).
 * `slots` only needs to contain entries for slots the sender actually moved
 * away from their template default -- a template's own DEFAULT_SLOTS is the
 * fallback for anything missing here, so an untouched slot always renders
 * correctly even if it's absent from a saved design_config.
 */
export type DesignConfig = {
  templateId: string;
  paletteId: string;
  fontPairId: string;
  iconId: string | null;
  slots: Record<string, SlotOffset>;
};

/** x/y/scale a slot renders at if the sender never dragged/resized it. */
export const DEFAULT_SLOT_OFFSET: SlotOffset = { x: 0, y: 0, scale: 1 };

export function resolveSlotOffset(
  config: DesignConfig | null | undefined,
  slotId: string,
  templateDefault: SlotOffset,
): SlotOffset {
  return config?.slots?.[slotId] ?? templateDefault;
}

// Bounds a slot offset can realistically need -- generous enough that a
// sender dragging within (or slightly past, since react-rnd's own bounds
// prop already constrains this in the UI) a template's safe area never gets
// clamped in normal use, tight enough that a malformed/malicious direct API
// call can't inject an absurd value. Same defense-in-depth pattern as the
// RSVP category-count clamp in POST /api/events/[slug]/rsvps.
const MIN_COORD = -50;
const MAX_COORD = 150;
const MIN_SCALE = 0.25;
const MAX_SCALE = 3;

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/**
 * Validates and clamps a client-supplied design_config into a well-formed
 * one, or returns null if the required fields aren't even present -- used
 * by POST /api/events and PUT /api/events/[slug] so a direct API call can't
 * store an unbounded slots object or reference a template/palette/font/icon
 * id that doesn't exist in the fixed registries.
 */
export function sanitizeDesignConfig(
  raw: unknown,
  validTemplateIds: string[],
  validPaletteIds: string[],
  validFontPairIds: string[],
  validIconIds: string[],
): DesignConfig | null {
  if (typeof raw !== "object" || raw === null) return null;
  const input = raw as Record<string, unknown>;

  const templateId = typeof input.templateId === "string" ? input.templateId : "";
  const paletteId = typeof input.paletteId === "string" ? input.paletteId : "";
  const fontPairId = typeof input.fontPairId === "string" ? input.fontPairId : "";
  if (!validTemplateIds.includes(templateId)) return null;
  if (!validPaletteIds.includes(paletteId)) return null;
  if (!validFontPairIds.includes(fontPairId)) return null;

  const rawIconId = typeof input.iconId === "string" ? input.iconId : null;
  const iconId = rawIconId && validIconIds.includes(rawIconId) ? rawIconId : null;

  const slots: Record<string, SlotOffset> = {};
  if (typeof input.slots === "object" && input.slots !== null) {
    for (const [slotId, value] of Object.entries(input.slots as Record<string, unknown>)) {
      if (typeof value !== "object" || value === null) continue;
      const v = value as Record<string, unknown>;
      slots[slotId] = {
        x: clamp(v.x, MIN_COORD, MAX_COORD, DEFAULT_SLOT_OFFSET.x),
        y: clamp(v.y, MIN_COORD, MAX_COORD, DEFAULT_SLOT_OFFSET.y),
        scale: clamp(v.scale, MIN_SCALE, MAX_SCALE, DEFAULT_SLOT_OFFSET.scale),
      };
    }
  }

  return { templateId, paletteId, fontPairId, iconId, slots };
}

/**
 * Shared types for the "designed_template" EventKind -- the Fabric.js
 * canvas-based invitation designer. See "custom rsvp card designer.md"
 * (section 7 onward) for the research/decision writeup behind this shape.
 *
 * `canvasJSON` is Fabric's own `canvas.toJSON()` scene graph (objects,
 * positions, colors, text content, embedded images) -- no custom scene-graph
 * parsing is written or maintained here, Fabric's own (de)serialization is
 * trusted for shape and only lightly validated for size/structure below.
 *
 * Colors are free-form hex (background/text/textMuted/accent/onAccent) --
 * the original fixed DESIGN_PALETTES list is now just a set of quick-pick
 * starting points (see design-palettes.ts), not the only option, per explicit
 * user feedback that four fixed named themes felt limiting/uncreative and
 * one of them ("Celebration") read badly. `paletteId` is kept only so old
 * rows created before this change still have a value to resolve colors from.
 */

export type DesignColors = {
  background: string;
  text: string;
  textMuted: string;
  accent: string;
  onAccent: string;
};

export type DesignConfig = {
  paletteId?: string;
  fontPairId: string;
  colors: DesignColors;
  canvasJSON: Record<string, unknown>;
  canvasWidth: number;
  canvasHeight: number;
};

export const DEFAULT_DESIGN_COLORS: DesignColors = {
  background: "#FDF2F5",
  text: "#2B2521",
  textMuted: "#6B6259",
  accent: "#C42E3D",
  onAccent: "#FFFFFF",
};

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function sanitizeHexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR_RE.test(value) ? value : fallback;
}

function sanitizeColors(raw: unknown): DesignColors {
  const input = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    background: sanitizeHexColor(input.background, DEFAULT_DESIGN_COLORS.background),
    text: sanitizeHexColor(input.text, DEFAULT_DESIGN_COLORS.text),
    textMuted: sanitizeHexColor(input.textMuted, DEFAULT_DESIGN_COLORS.textMuted),
    accent: sanitizeHexColor(input.accent, DEFAULT_DESIGN_COLORS.accent),
    onAccent: sanitizeHexColor(input.onAccent, DEFAULT_DESIGN_COLORS.onAccent),
  };
}

export const DEFAULT_CANVAS_WIDTH = 1000;
export const DEFAULT_CANVAS_HEIGHT = 1250; // 4:5, matches the card aspect ratio used elsewhere in the app

const MIN_CANVAS_DIMENSION = 200;
const MAX_CANVAS_DIMENSION = 4000;

// A canvas with several embedded photos could otherwise store an unbounded
// blob -- same defense-in-depth posture as isAcceptedImageDataUrlSize() in
// src/lib/image-upload.ts.
export const MAX_CANVAS_JSON_BYTES = 2 * 1024 * 1024;

function clampDimension(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_CANVAS_DIMENSION, Math.max(MIN_CANVAS_DIMENSION, n));
}

/** A loose structural check that `value` looks like a Fabric canvas JSON export. */
function isPlausibleCanvasJSON(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.objects);
}

/**
 * Normalizes a client-supplied design_config into a well-formed one --
 * always succeeds (never rejects the request) since the only thing this app
 * requires to create or save a designed_template event is an event title,
 * per explicit user instruction. Anything missing/malformed (a bad font id,
 * a non-hex color, an oversized/malformed canvas blob) is quietly replaced
 * with a safe default rather than failing the whole save, since this also
 * has to double as defense-in-depth against a direct API call sending
 * garbage -- it just clamps instead of rejecting now.
 */
export function sanitizeDesignConfig(
  raw: unknown,
  validFontPairIds: string[],
  fallbackFontPairId: string,
): DesignConfig {
  const input = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};

  const fontPairId =
    typeof input.fontPairId === "string" && validFontPairIds.includes(input.fontPairId)
      ? input.fontPairId
      : fallbackFontPairId;

  const paletteId = typeof input.paletteId === "string" ? input.paletteId : undefined;
  const colors = sanitizeColors(input.colors);

  let canvasJSON: Record<string, unknown> = { objects: [] };
  if (isPlausibleCanvasJSON(input.canvasJSON)) {
    try {
      const serialized = JSON.stringify(input.canvasJSON);
      // .length (UTF-16 code units) slightly overcounts vs. true UTF-8 byte
      // size, which only makes this bound slightly stricter -- fine for a
      // defense-in-depth cap. Oversized JSON falls back to an empty canvas
      // rather than failing the save outright.
      if (serialized.length <= MAX_CANVAS_JSON_BYTES) {
        canvasJSON = input.canvasJSON;
      }
    } catch {
      // keep the empty-canvas fallback
    }
  }

  const canvasWidth = clampDimension(input.canvasWidth, DEFAULT_CANVAS_WIDTH);
  const canvasHeight = clampDimension(input.canvasHeight, DEFAULT_CANVAS_HEIGHT);

  return {
    ...(paletteId ? { paletteId } : {}),
    fontPairId,
    colors,
    canvasJSON,
    canvasWidth,
    canvasHeight,
  };
}

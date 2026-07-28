/**
 * Shared types for the "designed_template" EventKind -- the Fabric.js
 * canvas-based invitation designer. See "custom rsvp card designer.md"
 * (section 7 onward) for the research/decision writeup behind this shape.
 *
 * `canvasJSON` is Fabric's own `canvas.toJSON()` scene graph (objects,
 * positions, colors, text content, embedded images) -- no custom scene-graph
 * parsing is written or maintained here, Fabric's own (de)serialization is
 * trusted for shape and only lightly validated for size/structure below.
 */

export type DesignConfig = {
  paletteId: string;
  fontPairId: string;
  canvasJSON: Record<string, unknown>;
  canvasWidth: number;
  canvasHeight: number;
};

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
 * Validates and clamps a client-supplied design_config into a well-formed
 * one, or returns null if the required fields aren't even present -- used
 * by POST /api/events and PUT /api/events/[slug] so a direct API call can't
 * reference a palette/font id that doesn't exist in the fixed registries,
 * store a malformed canvas scene, or store an unbounded canvasJSON blob.
 */
export function sanitizeDesignConfig(
  raw: unknown,
  validPaletteIds: string[],
  validFontPairIds: string[],
): DesignConfig | null {
  if (typeof raw !== "object" || raw === null) return null;
  const input = raw as Record<string, unknown>;

  const paletteId = typeof input.paletteId === "string" ? input.paletteId : "";
  const fontPairId = typeof input.fontPairId === "string" ? input.fontPairId : "";
  if (!validPaletteIds.includes(paletteId)) return null;
  if (!validFontPairIds.includes(fontPairId)) return null;

  if (!isPlausibleCanvasJSON(input.canvasJSON)) return null;

  let serialized: string;
  try {
    serialized = JSON.stringify(input.canvasJSON);
  } catch {
    return null;
  }
  // .length (UTF-16 code units) slightly overcounts vs. true UTF-8 byte size,
  // which only makes this bound slightly stricter -- fine for a defense-in-
  // depth cap, and keeps this module usable from both client and server code.
  if (serialized.length > MAX_CANVAS_JSON_BYTES) return null;

  const canvasWidth = clampDimension(input.canvasWidth, DEFAULT_CANVAS_WIDTH);
  const canvasHeight = clampDimension(input.canvasHeight, DEFAULT_CANVAS_HEIGHT);

  return {
    paletteId,
    fontPairId,
    canvasJSON: input.canvasJSON as Record<string, unknown>,
    canvasWidth,
    canvasHeight,
  };
}

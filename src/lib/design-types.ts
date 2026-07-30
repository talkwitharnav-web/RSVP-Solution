/**
 * Shared types for the "designed_template" EventKind -- the Fabric.js
 * canvas-based invitation designer. See "custom rsvp card designer.md"
 * (section 7 onward) for the research/decision writeup behind this shape.
 *
 * `canvasJSON` is Fabric's own scene graph, rebuilt through a strict allowlist
 * before storage so public guest renders never load arbitrary Fabric classes,
 * remote image URLs, filters, clip paths, or unbounded nested structures.
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
// src/lib/image-upload.ts. Raised from 2MB once images started being
// downscaled before being added (prepareImageForCanvas): the old cap was
// below what a single full-size phone photo produced, so a legitimate design
// would silently trip the empty-canvas fallback below and lose everything.
// The editor also checks this bound before saving so a sender gets a real
// error instead of a silent wipe; this remains the server-side backstop.
export const MAX_CANVAS_JSON_BYTES = 8 * 1024 * 1024;

const MAX_TOP_LEVEL_OBJECTS = 100;
const MAX_TOTAL_OBJECTS = 300;
const MAX_GROUP_CHILDREN = 64;
const MAX_TEXT_LENGTH = 5000;
const MAX_TOTAL_TEXT_LENGTH = 20000;
const MAX_TOTAL_STYLE_RANGES = 10000;
const MAX_PATH_COMMANDS = 2000;
const MAX_TOTAL_PATH_COMMANDS = 10000;
const MAX_POINTS = 2000;
const MAX_IMAGE_DATA_URL_LENGTH = Math.ceil(((5 * 1024 * 1024) * 4) / 3) + 100;
const ACCEPTED_IMAGE_DATA_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
]);
const SAFE_IDENTIFIER_RE = /^[a-zA-Z0-9._:-]+$/;
const HEX_OR_FUNCTION_COLOR_RE = /^(?:#[0-9a-f]{3,8}|(?:rgba?|hsla?)\([0-9+\-.,% /]+\)|transparent|none|currentColor)$/i;
const PATH_COMMAND_RE = /^[MLHVCSQTAZ]$/i;

type SceneBudget = {
  objects: number;
  textCharacters: number;
  styleRanges: number;
  pathCommands: number;
  layerIds: Set<string>;
  nextLayerNumber: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedNumber(value: unknown, min: number, max: number): number | undefined {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return undefined;
  return Math.min(max, Math.max(min, numberValue));
}

function copyNumber(
  output: Record<string, unknown>,
  input: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
) {
  const value = boundedNumber(input[key], min, max);
  if (value !== undefined) output[key] = value;
}

function copyBoolean(output: Record<string, unknown>, input: Record<string, unknown>, key: string) {
  if (typeof input[key] === "boolean") output[key] = input[key];
}

function copyEnum(
  output: Record<string, unknown>,
  input: Record<string, unknown>,
  key: string,
  allowed: readonly string[],
) {
  const value = input[key];
  if (typeof value === "string" && allowed.includes(value)) output[key] = value;
}

function safeMetadataString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed && !/[\u0000-\u001f\u007f]/.test(trimmed) ? trimmed : undefined;
}

function safeIdentifier(value: unknown, maxLength = 80): string | undefined {
  const text = safeMetadataString(value, maxLength);
  return text && SAFE_IDENTIFIER_RE.test(text) ? text : undefined;
}

function safePaint(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (value === "") return "";
  if (typeof value !== "string" || value.length > 80) return undefined;
  return HEX_OR_FUNCTION_COLOR_RE.test(value) ? value : undefined;
}

function copyPaint(output: Record<string, unknown>, input: Record<string, unknown>, key: string) {
  const value = safePaint(input[key]);
  if (value !== undefined) output[key] = value;
}

function sanitizeDashArray(value: unknown): number[] | null | undefined {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length > 32) return undefined;
  const output: number[] = [];
  for (const part of value) {
    const numberValue = boundedNumber(part, 0, 1000);
    if (numberValue === undefined) return undefined;
    output.push(numberValue);
  }
  return output;
}

function sanitizeCommonObject(input: Record<string, unknown>, type: string): Record<string, unknown> {
  const output: Record<string, unknown> = { type };

  copyNumber(output, input, "left", -16000, 16000);
  copyNumber(output, input, "top", -16000, 16000);
  copyNumber(output, input, "width", 0, 8000);
  copyNumber(output, input, "height", 0, 8000);

  const width = typeof output.width === "number" ? output.width : 0;
  const height = typeof output.height === "number" ? output.height : 0;
  const maxScaleX = width > 0 ? Math.min(20, 12000 / width) : 20;
  const maxScaleY = height > 0 ? Math.min(20, 12000 / height) : 20;
  copyNumber(output, input, "scaleX", -maxScaleX, maxScaleX);
  copyNumber(output, input, "scaleY", -maxScaleY, maxScaleY);
  copyNumber(output, input, "angle", -36000, 36000);
  copyNumber(output, input, "skewX", -89, 89);
  copyNumber(output, input, "skewY", -89, 89);
  copyNumber(output, input, "opacity", 0, 1);
  copyNumber(output, input, "strokeWidth", 0, 500);
  copyNumber(output, input, "strokeDashOffset", -16000, 16000);
  copyNumber(output, input, "strokeMiterLimit", 0, 1000);

  copyBoolean(output, input, "flipX");
  copyBoolean(output, input, "flipY");
  copyBoolean(output, input, "visible");
  copyBoolean(output, input, "strokeUniform");

  copyEnum(output, input, "originX", ["left", "center", "right"]);
  copyEnum(output, input, "originY", ["top", "center", "bottom"]);
  copyEnum(output, input, "fillRule", ["nonzero", "evenodd"]);
  copyEnum(output, input, "paintFirst", ["fill", "stroke"]);
  copyEnum(output, input, "strokeLineCap", ["butt", "round", "square"]);
  copyEnum(output, input, "strokeLineJoin", ["bevel", "round", "miter"]);

  copyPaint(output, input, "fill");
  copyPaint(output, input, "stroke");
  copyPaint(output, input, "backgroundColor");

  const strokeDashArray = sanitizeDashArray(input.strokeDashArray);
  if (strokeDashArray !== undefined) output.strokeDashArray = strokeDashArray;

  return output;
}

function sanitizeFontWeight(value: unknown): string | number | undefined {
  if (value === "normal" || value === "bold") return value;
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric >= 100 && numeric <= 900 && numeric % 100 === 0) {
    return typeof value === "string" ? String(numeric) : numeric;
  }
  return undefined;
}

function sanitizeTextStyles(value: unknown, textLength: number, budget: SceneBudget): Record<string, unknown>[] {
  if (!Array.isArray(value) || budget.styleRanges <= 0) return [];
  const output: Record<string, unknown>[] = [];
  const maxRanges = Math.min(value.length, budget.styleRanges, MAX_TOTAL_STYLE_RANGES);

  for (const rawRange of value.slice(0, maxRanges)) {
    const range = asRecord(rawRange);
    const styleInput = asRecord(range?.style);
    if (!range || !styleInput) continue;

    const start = Number(range.start);
    const end = Number(range.end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > textLength) {
      continue;
    }

    const style: Record<string, unknown> = {};
    copyPaint(style, styleInput, "fill");
    copyPaint(style, styleInput, "stroke");
    copyPaint(style, styleInput, "textBackgroundColor");
    copyNumber(style, styleInput, "strokeWidth", 0, 100);
    copyNumber(style, styleInput, "fontSize", 4, 1000);
    copyNumber(style, styleInput, "deltaY", -2000, 2000);
    copyNumber(style, styleInput, "textDecorationThickness", 0, 100);
    copyBoolean(style, styleInput, "underline");
    copyBoolean(style, styleInput, "overline");
    copyBoolean(style, styleInput, "linethrough");
    copyEnum(style, styleInput, "fontStyle", ["normal", "italic", "oblique"]);

    const fontWeight = sanitizeFontWeight(styleInput.fontWeight);
    if (fontWeight !== undefined) style.fontWeight = fontWeight;

    const fontKey = safeIdentifier(styleInput.fontKey);
    if (fontKey) {
      style.fontKey = fontKey;
      // Fabric needs a real fontFamily value to preserve run boundaries when
      // serializing. The renderer replaces this placeholder from fontKey.
      style.fontFamily = "sans-serif";
    }

    if (Object.keys(style).length === 0) continue;
    output.push({ start, end, style });
    budget.styleRanges -= 1;
  }

  return output;
}

function sanitizePath(value: unknown, budget: SceneBudget): unknown[][] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PATH_COMMANDS) return null;
  if (value.length > budget.pathCommands) return null;

  const output: unknown[][] = [];
  for (const rawCommand of value) {
    if (!Array.isArray(rawCommand) || rawCommand.length < 1 || rawCommand.length > 8) return null;
    const command = rawCommand[0];
    if (typeof command !== "string" || !PATH_COMMAND_RE.test(command)) return null;
    const safeCommand: unknown[] = [command];
    for (const coordinate of rawCommand.slice(1)) {
      const numberValue = boundedNumber(coordinate, -16000, 16000);
      if (numberValue === undefined) return null;
      safeCommand.push(numberValue);
    }
    output.push(safeCommand);
  }

  budget.pathCommands -= output.length;
  return output;
}

function sanitizePoints(value: unknown): { x: number; y: number }[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_POINTS) return null;
  const output: { x: number; y: number }[] = [];
  for (const rawPoint of value) {
    const point = asRecord(rawPoint);
    const x = boundedNumber(point?.x, -16000, 16000);
    const y = boundedNumber(point?.y, -16000, 16000);
    if (x === undefined || y === undefined) return null;
    output.push({ x, y });
  }
  return output;
}

function isAcceptedImageDataUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_IMAGE_DATA_URL_LENGTH) return false;
  const match = /^data:([^;]+);base64,/i.exec(value);
  return !!match && ACCEPTED_IMAGE_DATA_TYPES.has(match[1].toLowerCase());
}

const ALLOWED_OBJECT_TYPES = new Set([
  "Textbox",
  "IText",
  "Text",
  "Image",
  "Group",
  "Path",
  "Circle",
  "Ellipse",
  "Line",
  "Polyline",
  "Polygon",
  "Rect",
]);

const ALLOWED_GROUP_CHILD_TYPES = new Set([
  "Path",
  "Circle",
  "Ellipse",
  "Line",
  "Polyline",
  "Polygon",
  "Rect",
]);

function nextSafeLayerId(input: Record<string, unknown>, budget: SceneBudget): string {
  let layerId = safeIdentifier(input.layerId, 128);
  if (!layerId || budget.layerIds.has(layerId)) {
    do {
      budget.nextLayerNumber += 1;
      layerId = `layer-${budget.nextLayerNumber}`;
    } while (budget.layerIds.has(layerId));
  }
  budget.layerIds.add(layerId);
  return layerId;
}

function inferredLayerKind(type: string): "text" | "image" | "icon" | "decoration" | "other" {
  if (type === "Textbox" || type === "IText" || type === "Text") return "text";
  if (type === "Image") return "image";
  if (type === "Group") return "icon";
  if (type === "Path") return "decoration";
  return "other";
}

function sanitizeCanvasObject(
  raw: unknown,
  budget: SceneBudget,
  depth: number,
): Record<string, unknown> | null {
  const input = asRecord(raw);
  const type = input?.type;
  if (!input || typeof type !== "string" || !ALLOWED_OBJECT_TYPES.has(type)) return null;
  if (depth > 0 && !ALLOWED_GROUP_CHILD_TYPES.has(type)) return null;
  if (budget.objects <= 0) return null;
  budget.objects -= 1;

  const output = sanitizeCommonObject(input, type);

  if (type === "Textbox" || type === "IText" || type === "Text") {
    const rawText = typeof input.text === "string" ? input.text.replace(/\u0000/g, "") : "";
    const text = rawText.slice(0, Math.min(MAX_TEXT_LENGTH, budget.textCharacters));
    budget.textCharacters -= text.length;
    output.text = text;
    output.fontFamily = "sans-serif";
    copyNumber(output, input, "fontSize", 4, 1000);
    copyNumber(output, input, "lineHeight", 0.5, 5);
    copyNumber(output, input, "charSpacing", -5000, 5000);
    copyNumber(output, input, "minWidth", 0, 8000);
    copyNumber(output, input, "textDecorationThickness", 0, 100);
    copyBoolean(output, input, "underline");
    copyBoolean(output, input, "overline");
    copyBoolean(output, input, "linethrough");
    copyBoolean(output, input, "splitByGrapheme");
    copyEnum(output, input, "fontStyle", ["normal", "italic", "oblique"]);
    copyEnum(output, input, "textAlign", ["left", "center", "right", "justify", "justify-left", "justify-center", "justify-right"]);
    copyEnum(output, input, "direction", ["ltr", "rtl"]);
    copyPaint(output, input, "textBackgroundColor");
    const fontWeight = sanitizeFontWeight(input.fontWeight);
    if (fontWeight !== undefined) output.fontWeight = fontWeight;
    const styles = sanitizeTextStyles(input.styles, text.length, budget);
    if (styles.length > 0) output.styles = styles;
  } else if (type === "Image") {
    if (!isAcceptedImageDataUrl(input.src)) return null;
    output.src = input.src;
    copyNumber(output, input, "cropX", 0, 8000);
    copyNumber(output, input, "cropY", 0, 8000);
    // filters, resizeFilter and crossOrigin are deliberately omitted.
  } else if (type === "Group") {
    if (depth !== 0 || !Array.isArray(input.objects)) return null;
    const children: Record<string, unknown>[] = [];
    for (const child of input.objects.slice(0, MAX_GROUP_CHILDREN)) {
      const sanitized = sanitizeCanvasObject(child, budget, depth + 1);
      if (sanitized) children.push(sanitized);
    }
    if (children.length === 0) return null;
    output.objects = children;
  } else if (type === "Path") {
    const path = sanitizePath(input.path, budget);
    if (!path) return null;
    output.path = path;
  } else if (type === "Circle") {
    copyNumber(output, input, "radius", 0, 8000);
    copyNumber(output, input, "startAngle", -36000, 36000);
    copyNumber(output, input, "endAngle", -36000, 36000);
    copyBoolean(output, input, "counterClockwise");
  } else if (type === "Ellipse") {
    copyNumber(output, input, "rx", 0, 8000);
    copyNumber(output, input, "ry", 0, 8000);
  } else if (type === "Line") {
    for (const key of ["x1", "x2", "y1", "y2"]) copyNumber(output, input, key, -16000, 16000);
  } else if (type === "Polyline" || type === "Polygon") {
    const points = sanitizePoints(input.points);
    if (!points) return null;
    output.points = points;
  } else if (type === "Rect") {
    copyNumber(output, input, "rx", 0, 8000);
    copyNumber(output, input, "ry", 0, 8000);
  }

  if (depth === 0) {
    output.layerId = nextSafeLayerId(input, budget);
    output.kind = inferredLayerKind(type);
    output.label = safeMetadataString(input.label, 120) ?? inferredLayerKind(type);
    if (type === "Textbox" || type === "IText" || type === "Text") {
      output.fontRole = input.fontRole === "body" ? "body" : "display";
      const fontFamilyId = safeIdentifier(input.fontFamilyId);
      if (fontFamilyId) output.fontFamilyId = fontFamilyId;
      if (typeof input.autoWidth === "boolean") output.autoWidth = input.autoWidth;
    }
  }

  return output;
}

export function sanitizeCanvasJSON(value: unknown, background: string): Record<string, unknown> {
  const input = asRecord(value);
  if (!input || !Array.isArray(input.objects)) return { objects: [], background };

  const budget: SceneBudget = {
    objects: MAX_TOTAL_OBJECTS,
    textCharacters: MAX_TOTAL_TEXT_LENGTH,
    styleRanges: MAX_TOTAL_STYLE_RANGES,
    pathCommands: MAX_TOTAL_PATH_COMMANDS,
    layerIds: new Set(),
    nextLayerNumber: 0,
  };
  const objects: Record<string, unknown>[] = [];
  for (const rawObject of input.objects.slice(0, MAX_TOP_LEVEL_OBJECTS)) {
    const object = sanitizeCanvasObject(rawObject, budget, 0);
    if (object) objects.push(object);
  }

  return { objects, background };
}

function clampDimension(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_CANVAS_DIMENSION, Math.max(MIN_CANVAS_DIMENSION, n));
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

  let canvasJSON: Record<string, unknown> = { objects: [], background: colors.background };
  if (asRecord(input.canvasJSON) && Array.isArray((input.canvasJSON as Record<string, unknown>).objects)) {
    try {
      const serialized = JSON.stringify(input.canvasJSON);
      if (new TextEncoder().encode(serialized).byteLength <= MAX_CANVAS_JSON_BYTES) {
        canvasJSON = sanitizeCanvasJSON(input.canvasJSON, colors.background);
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

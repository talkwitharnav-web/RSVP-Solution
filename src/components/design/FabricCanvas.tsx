"use client";

import { createElement, forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as fabric from "fabric";
import { DesignDecorationOption, DesignIconOption, getDesignIcon, getDesignDecoration } from "@/lib/design-icons";
import { DesignFontRole, ensureFontsLoaded, resolveFontFamilyById, resolveFontPairFamilies } from "@/lib/design-fonts";
import { applyRotationSnap, initSnapping, SnapController } from "./canvas-snapping";
import type { DesignTemplate } from "@/lib/design-templates";
import type { DesignColors } from "@/lib/design-types";

/**
 * Thin, direct wrapper around a real fabric.Canvas -- Fabric has no official
 * React bindings, so this owns the <canvas> ref + fabric.Canvas instance
 * lifecycle itself (create on mount, dispose on unmount), rather than using
 * a third-party binding. Replaces the old react-rnd-based SlotEditor/
 * DesignedCardContent split: this single component handles both the
 * interactive editor (readOnly=false) and the guest-facing render
 * (readOnly=true), guaranteeing they can never visually drift -- same
 * principle the old components followed, just against a real canvas engine
 * instead of a fixed slot layout.
 *
 * The logical canvas size (canvasWidth/canvasHeight) is fixed design-space
 * pixels, independent of how large the component renders on screen -- a
 * ResizeObserver measures the actual container and Fabric's own zoom/
 * viewport transform scales the fixed logical canvas to fit, so the same
 * canvasJSON renders identically in the editor and on the guest page.
 */

export type CanvasLayerKind = "text" | "image" | "icon" | "decoration" | "other";

export type CanvasLayerSummary = {
  /** Fabric assigns no stable id by default -- objects get one stamped on add so the layers panel can track/select them across re-renders. */
  layerId: string;
  kind: CanvasLayerKind;
  label: string;
};

/** Properties Fabric would otherwise drop from toObject()/loadFromJSON(). */
const CUSTOM_OBJECT_PROPS = ["layerId", "kind", "label", "fontRole", "fontFamilyId", "autoWidth"];

/** How much of the card a text box may span before its text starts wrapping. */
const TEXT_MAX_WIDTH_FRACTION = 0.84;

/**
 * Shrinks a text box to fit the text actually in it.
 *
 * Text boxes used to be created at a flat 80% of the card width whatever they
 * contained, so a short heading sat in a box with roughly 180px of dead space
 * on each side. That looks wrong by itself, and it also made resizing feel
 * broken: text is centred inside its box, so dragging the right edge inwards
 * moves the box's centre -- and with it the visible text -- to the left, even
 * though the left edge never actually moves. Measured and confirmed: after
 * dragging the right handle in, the left edge held at 99.99995 of 100.
 *
 * Measuring happens at the maximum width first. calcTextWidth() reports the
 * widest *wrapped* line, so measuring at the current (possibly already
 * narrow) width would just report that narrow width and the box could never
 * grow back once it had shrunk.
 */
function fitTextboxToContent(textbox: fabric.Textbox, canvasWidth: number) {
  const maxWidth = canvasWidth * TEXT_MAX_WIDTH_FRACTION;
  textbox.set({ width: maxWidth });
  textbox.initDimensions();
  // A small pad stops sub-pixel rounding from wrapping the final word.
  const natural = Math.ceil(textbox.calcTextWidth()) + 4;
  const floor = Math.max(textbox.dynamicMinWidth ?? 0, 24);
  textbox.set({ width: Math.max(floor, Math.min(maxWidth, natural)) });
  textbox.initDimensions();
  textbox.setCoords();
}

/** True while a text box is still sizing itself to its own content. */
function isAutoWidth(obj: fabric.FabricObject): boolean {
  return (obj as unknown as { autoWidth?: boolean }).autoWidth === true;
}

function setAutoWidth(obj: fabric.FabricObject, value: boolean) {
  (obj as unknown as { autoWidth?: boolean }).autoWidth = value;
}

/**
 * Key held inside a per-character style entry to remember *which* curated
 * face a run of text was given, independent of the family name next/font
 * generated for this build.
 *
 * It has to ride alongside a real `fontFamily` rather than replacing it:
 * Fabric groups adjacent characters into ranges for serialization using a
 * fixed whitelist of properties it knows about, and a custom key isn't on
 * that list -- so two neighbouring runs differing *only* by this marker
 * would be merged into one and the second run's font silently lost. The
 * stored fontFamily is never trusted on load; it exists so run boundaries
 * are detected correctly, and is re-resolved from this marker afterwards.
 */
const CHAR_FONT_KEY = "fontKey";

/** Text styling the sidebar can read off / write to the current selection. */
export type SelectedTextProps = {
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  textAlign: string;
  /** Curated face id for the current selection, or null when it's the card's own pair / mixed. */
  fontFamilyId: string | null;
  /** True when only part of the text is selected, so the UI can say what a change will hit. */
  partialSelection: boolean;
};

export type FabricCanvasHandle = {
  addText: (role: DesignFontRole) => void;
  addImage: (dataUrl: string, label?: string) => Promise<void>;
  addIcon: (icon: DesignIconOption, color: string) => void;
  addDecoration: (decoration: DesignDecorationOption, color: string) => void;
  deleteSelected: () => void;
  duplicateSelected: () => Promise<void>;
  bringSelectedToFront: () => void;
  sendSelectedToBack: () => void;
  recolorSelected: (color: string) => void;
  /** Current fill/stroke of the active object, so the recolor swatch can show the real value instead of always black. */
  getSelectedColor: () => string | null;
  /** Null when the selection isn't text -- drives whether the type panel shows at all. */
  getSelectedTextProps: () => SelectedTextProps | null;
  setSelectedTextProps: (props: Partial<SelectedTextProps>) => void;
  /** Applies a curated face to the selected characters, or the whole object when nothing is highlighted. */
  setSelectedFontFamily: (familyId: string) => Promise<void>;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  /** Replaces the canvas contents with an occasion template's layout. */
  applyTemplate: (template: DesignTemplate) => Promise<void>;
  /** Recolours existing objects to a new palette (offered after a theme change). */
  recolorAllToPalette: (colors: DesignColors) => void;
  getJSON: () => Record<string, unknown>;
  hasSelection: () => boolean;
  /** Layers panel support -- topmost (front) object first, matching how a layers list is normally read. */
  getLayers: () => CanvasLayerSummary[];
  selectLayer: (layerId: string) => void;
  moveLayer: (layerId: string, toFrontIndex: number) => void;
  deleteLayer: (layerId: string) => void;
  /** Zoom controls. 1 means "fitted to the panel", which is also the minimum. */
  zoomBy: (factor: number) => void;
  zoomToFit: () => void;
};

type FabricCanvasProps = {
  canvasWidth: number;
  canvasHeight: number;
  initialJSON: Record<string, unknown> | null;
  backgroundColor: string;
  /** Which curated font pair this card uses; resolved to real family names at render time. */
  fontPairId: string;
  /** Default fill for newly added text -- previously hardcoded black, which was invisible on a dark card. */
  textColor?: string;
  readOnly?: boolean;
  className?: string;
  onSelectionChange?: (hasSelection: boolean) => void;
  onChange?: () => void;
  /**
   * Fired once after the stored design finishes loading, so the parent can
   * populate its layers/history panels. Separate from onChange because that
   * one means "the sender edited something" and drives the unsaved-changes
   * warning -- reusing it here made a freshly opened, untouched invitation
   * claim it had unsaved changes and prompt on navigate-away.
   */
  onReady?: () => void;
  /** Current zoom multiple, so the toolbar can show it. 1 = fitted. */
  onZoomChange?: (userZoom: number) => void;
};

/** Zoom never goes below "fits the panel" -- there's no reason to shrink a card past that. */
const MIN_USER_ZOOM = 1;
const MAX_USER_ZOOM = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildCompoundPath(paths: string[]): string {
  return paths.join(" ");
}

let layerIdCounter = 0;
function nextLayerId(): string {
  layerIdCounter += 1;
  return `layer-${Date.now()}-${layerIdCounter}`;
}

// Fabric objects carry no domain metadata by default -- stamping a stable
// layerId/kind/label directly onto the object (Fabric persists arbitrary
// extra properties through toJSON/loadFromJSON automatically) is what lets
// the layers panel track, select, and reorder objects across re-renders,
// and what lets addIcon/addDecoration apply a ratio lock only to the kinds
// that should never stretch non-uniformly.
type LayerMeta = {
  layerId: string;
  kind: CanvasLayerKind;
  label: string;
  fontRole?: DesignFontRole;
  /** Set only when the whole object was given a face of its own, overriding the card's pair. */
  fontFamilyId?: string;
};

function stampLayerMeta(obj: fabric.FabricObject, meta: LayerMeta) {
  obj.set(meta as unknown as Record<string, unknown>);
}

function readLayerMeta(obj: fabric.FabricObject): LayerMeta {
  const anyObj = obj as unknown as Partial<LayerMeta>;
  return {
    layerId: anyObj.layerId ?? nextLayerId(),
    kind: anyObj.kind ?? "other",
    label: anyObj.label ?? "Element",
    fontRole: anyObj.fontRole,
    fontFamilyId: anyObj.fontFamilyId,
  };
}

type CharStyle = Record<string, unknown>;

/** Every per-character style entry on a text object, as a flat list. */
function characterStyles(obj: fabric.IText): CharStyle[] {
  const styles = obj.styles as unknown as Record<string, Record<string, CharStyle>> | undefined;
  if (!styles) return [];
  const out: CharStyle[] = [];
  for (const line of Object.values(styles)) {
    if (line) out.push(...Object.values(line).filter(Boolean));
  }
  return out;
}

/**
 * Which characters a styling action should apply to. Fabric stores styles per
 * character, so "make just this bit italic" is a genuine capability rather
 * than something that needs emulating -- it only needs the right range.
 * Returns null when there's no highlighted run, meaning the whole object.
 */
function activeTextRange(obj: fabric.IText): { start: number; end: number } | null {
  if (!obj.isEditing) return null;
  const start = obj.selectionStart ?? 0;
  const end = obj.selectionEnd ?? 0;
  return end > start ? { start, end } : null;
}

/**
 * Per-character values take priority over the object-level property, so a
 * whole-object change has to remove them or it looks like it did nothing
 * wherever a run had been styled individually.
 */
function clearCharacterStyleKeys(obj: fabric.IText, keys: string[]) {
  for (const charStyle of characterStyles(obj)) {
    for (const key of keys) delete charStyle[key];
  }
}

function applyTextStyle(obj: fabric.IText, style: CharStyle, alsoClearKeys: string[] = []) {
  const range = activeTextRange(obj);
  if (range) {
    obj.setSelectionStyles(style, range.start, range.end);
    return;
  }
  obj.set(style as Partial<fabric.IText>);
  clearCharacterStyleKeys(obj, [...Object.keys(style), ...alsoClearKeys]);
}

/**
 * Reads a property for whatever is currently selected. Over a highlighted
 * run the value is only reported when every character agrees -- a mixed run
 * returns undefined, which the toolbar renders as "off" rather than
 * pretending the whole selection is bold.
 */
function readTextStyle(obj: fabric.IText, key: string): unknown {
  const range = activeTextRange(obj);
  const objectValue = (obj as unknown as CharStyle)[key];
  if (!range) return objectValue;
  const styles = obj.getSelectionStyles(range.start, range.end, true) as CharStyle[];
  if (styles.length === 0) return objectValue;
  const first = styles[0]?.[key];
  return styles.every((s) => s?.[key] === first) ? first : undefined;
}

/** Curated face ids referenced anywhere on the object, object-level or per-run. */
function fontFamilyIdsInUse(obj: fabric.IText): string[] {
  const ids = new Set<string>();
  const meta = readLayerMeta(obj);
  if (meta.fontFamilyId) ids.add(meta.fontFamilyId);
  for (const charStyle of characterStyles(obj)) {
    const key = charStyle[CHAR_FONT_KEY];
    if (typeof key === "string") ids.add(key);
  }
  return [...ids];
}

/**
 * Rewrites each styled run's fontFamily from its stable marker. Needed for
 * the same reason the object-level family is re-resolved after every load:
 * the stored name is a build artifact, and on the guest page nothing else
 * would ever trigger a corrective re-render.
 */
function reresolveCharacterFonts(obj: fabric.IText) {
  for (const charStyle of characterStyles(obj)) {
    const key = charStyle[CHAR_FONT_KEY];
    if (typeof key !== "string") continue;
    const family = resolveFontFamilyById(key);
    if (family) charStyle.fontFamily = family;
  }
}

/**
 * Re-applies the card's font pair to every text object on the canvas. Fonts
 * are deliberately NOT baked into the stored canvasJSON -- next/font's
 * generated family names are a build artifact, so the stable fontPairId is
 * stored instead and resolved to a real family here on every load and on
 * every pair change. Re-setting fontFamily is also what forces Fabric to
 * discard its cached text metrics, which is why a font finishing loading in
 * the background otherwise leaves already-drawn text in the fallback face.
 *
 * `stillMounted` is checked after the await: loading a font is slow enough
 * that the canvas can be disposed underneath it (React StrictMode remounts
 * every effect once in development, and any navigation unmounts the editor),
 * and drawing into a disposed canvas throws on a null 2D context.
 */
async function applyFontPair(
  canvas: fabric.Canvas,
  fontPairId: string,
  logicalCanvasWidth: number,
  stillMounted: () => boolean = () => true,
) {
  const families = resolveFontPairFamilies(fontPairId);
  const texts = canvas.getObjects().filter((obj): obj is fabric.IText => obj instanceof fabric.IText);

  // Individually overridden faces have to be fetched too, or a run using one
  // draws in the fallback until something else happens to trigger a reload.
  const overrides = new Set<string>();
  for (const obj of texts) {
    for (const id of fontFamilyIdsInUse(obj)) {
      const family = resolveFontFamilyById(id);
      if (family) overrides.add(family);
    }
  }

  await ensureFontsLoaded([families.display, families.body, ...overrides]);
  if (!stillMounted()) return;

  for (const obj of texts) {
    const meta = readLayerMeta(obj);
    // An object given a face of its own keeps it; only text still following
    // the card's pair moves when the pair changes.
    const family = meta.fontFamilyId
      ? resolveFontFamilyById(meta.fontFamilyId) || families[meta.fontRole ?? "display"]
      : families[meta.fontRole ?? "display"];
    if (family) obj.set({ fontFamily: family });
    reresolveCharacterFonts(obj);
    // set() alone updates the property and Fabric's measuring context, but the
    // object keeps painting from its own cached bitmap -- so the card looked
    // unchanged even though the right font was being measured. initDimensions
    // re-measures; dirty forces the cache to be rebuilt.
    obj.initDimensions();
    // A different face is a different width, so a box still sizing itself to
    // its content has to be re-measured or it keeps the old face's width.
    if (obj instanceof fabric.Textbox && isAutoWidth(obj)) {
      fitTextboxToContent(obj, logicalCanvasWidth);
    }
    obj.setCoords();
    obj.dirty = true;
  }
  // renderAll(), not requestRenderAll(): the latter defers to
  // requestAnimationFrame, which browsers throttle to a standstill whenever
  // the tab isn't foregrounded -- so switching font in a background tab set
  // every property correctly and then simply never repainted. This is a
  // one-off response to a click, not a hot path, so rendering inline is cheap
  // and removes the timing dependency entirely.
  canvas.renderAll();
}

// Icons/decorations only expose corner controls -- dragging a corner always
// scales both axes together in Fabric, so this is what prevents "someone
// drags the side handle and the icon looks squashed." Images/text keep every
// control (free non-uniform resize is a reasonable thing to want on a photo).
function lockAspectRatio(obj: fabric.FabricObject) {
  obj.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false });
}

// A one-line body text object is only ~12 screen pixels tall once the card is
// scaled to fit, but Fabric's mid-edge handles are ~13 pixels -- so the mt/mb
// handles completely covered the middle of the object and trying to drag it
// resized it instead, which is how a text object ended up squashed during
// testing. Vertical-only scaling also just distorts the glyphs (font size is
// the control that should be used for that), so hiding both removes the
// overlap and a control that was never useful on text. ml/mr stay: on a
// Textbox those set the wrap width, which is genuinely wanted.
function hideVerticalTextControls(obj: fabric.FabricObject) {
  obj.setControlsVisibility({ mt: false, mb: false });
}

/**
 * A label that doesn't already exist on the canvas, so the layers panel can
 * tell two images (or two headings) apart instead of listing "Image" three
 * times with no way to know which row is which.
 *
 * The base is only stripped of a trailing " 2"-style suffix when it's
 * actually taken -- that's what makes duplicating "Balloon 3" give
 * "Balloon 4" instead of "Balloon 3 2", while leaving a label that just
 * happens to end in a number ("Ava turns 30") completely alone.
 */
function uniqueLabel(canvas: fabric.Canvas, base: string): string {
  const taken = new Set(canvas.getObjects().map((obj) => readLayerMeta(obj).label));
  if (!taken.has(base)) return base;
  const stem = base.replace(/ \d+$/, "");
  let n = 2;
  while (taken.has(`${stem} ${n}`)) n += 1;
  return `${stem} ${n}`;
}

/** Keeps a long filename from blowing out the layers row. */
function shortenFileName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Image";
  return trimmed.length <= 28 ? trimmed : `${trimmed.slice(0, 25)}...`;
}

export const FabricCanvas = forwardRef<FabricCanvasHandle, FabricCanvasProps>(
  function FabricCanvas(
    {
      canvasWidth,
      canvasHeight,
      initialJSON,
      backgroundColor,
      fontPairId,
      textColor = "#000000",
      readOnly = false,
      className,
      onSelectionChange,
      onChange,
      onReady,
      onZoomChange,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasElRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<fabric.Canvas | null>(null);
    const snapRef = useRef<SnapController | null>(null);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    // Latest values, read inside canvas callbacks that are registered once on
    // mount and would otherwise close over the first render's props forever.
    const fontPairIdRef = useRef(fontPairId);
    fontPairIdRef.current = fontPairId;
    const textColorRef = useRef(textColor);
    textColorRef.current = textColor;
    // Which canvasJSON is currently drawn, so the read-only reload effect
    // below can tell a genuine host edit from an unrelated parent re-render.
    const loadedJSONRef = useRef<Record<string, unknown> | null>(null);

    // Fabric ships no undo/redo, so this is the standard snapshot-stack
    // approach: serialize the whole scene after each committed change.
    // Depth is capped because embedded images are stored inline as base64 --
    // an unbounded stack would hold a copy of every photo per step.
    const undoStackRef = useRef<string[]>([]);
    const redoStackRef = useRef<string[]>([]);
    // Set while undo/redo is re-loading the canvas, so the resulting
    // object:added/removed events don't get recorded as fresh edits.
    const restoringRef = useRef(false);
    // Holds a detached clone for Ctrl+C / Ctrl+V. Deliberately in-app rather
    // than the system clipboard: the OS clipboard can't carry a Fabric object,
    // and reading it needs a permission prompt for no benefit here.
    const clipboardRef = useRef<fabric.FabricObject | null>(null);
    const MAX_HISTORY = 25;

    // Zoom is deliberately modelled as a *multiplier on top of* the
    // fit-to-container zoom, not a replacement for it. At userZoom 1 and no
    // pan the viewport transform is identical to the plain setZoom(fit) this
    // replaced, so the default view is unchanged -- and because only the
    // viewport moves, object coordinates are never touched. Fabric also
    // leaves viewportTransform out of toObject(), so none of this can leak
    // into the saved design or the guest page.
    const fitZoomRef = useRef(1);
    const userZoomRef = useRef(1);
    const panRef = useRef({ x: 0, y: 0 });

    const applyViewport = useCallback(
      (canvas: fabric.Canvas) => {
        const fit = fitZoomRef.current;
        const effective = fit * userZoomRef.current;
        const viewW = canvasWidth * fit;
        const viewH = canvasHeight * fit;
        const contentW = canvasWidth * effective;
        const contentH = canvasHeight * effective;
        // Clamped so the card can't be shoved off into empty space; when it
        // fits, the only legal offset is zero, which re-centres it exactly.
        panRef.current = {
          x: clamp(panRef.current.x, Math.min(0, viewW - contentW), 0),
          y: clamp(panRef.current.y, Math.min(0, viewH - contentH), 0),
        };
        canvas.setViewportTransform([
          effective,
          0,
          0,
          effective,
          panRef.current.x,
          panRef.current.y,
        ]);
        canvas.requestRenderAll();
        onZoomChange?.(userZoomRef.current);
      },
      [canvasWidth, canvasHeight, onZoomChange],
    );

    /** Zooms around a fixed point so whatever is under the cursor stays put. */
    const zoomAtPoint = useCallback(
      (canvas: fabric.Canvas, nextUserZoom: number, point: { x: number; y: number }) => {
        const before = fitZoomRef.current * userZoomRef.current;
        const scene = {
          x: (point.x - panRef.current.x) / before,
          y: (point.y - panRef.current.y) / before,
        };
        userZoomRef.current = clamp(nextUserZoom, MIN_USER_ZOOM, MAX_USER_ZOOM);
        const after = fitZoomRef.current * userZoomRef.current;
        panRef.current = { x: point.x - scene.x * after, y: point.y - scene.y * after };
        applyViewport(canvas);
      },
      [applyViewport],
    );

    const snapshot = (canvas: fabric.Canvas) =>
      JSON.stringify(canvas.toObject(CUSTOM_OBJECT_PROPS));

    const recordHistory = (canvas: fabric.Canvas) => {
      if (restoringRef.current) return;
      undoStackRef.current.push(snapshot(canvas));
      if (undoStackRef.current.length > MAX_HISTORY) undoStackRef.current.shift();
      // Any new edit invalidates the redo branch, same as every editor.
      redoStackRef.current = [];
    };

    /** Shared by undo and redo -- both are "restore this serialized scene". */
    const restore = (canvas: fabric.Canvas, json: string) => {
      restoringRef.current = true;
      // loadFromJSON replaces every object, which drops the selection. Layer
      // ids survive serialization, so the same element can be re-selected
      // afterwards -- without this, every undo dumps you back to no selection
      // and the type/colour panel vanishes mid-edit.
      const previouslySelected = canvas.getActiveObject();
      const selectedLayerId = previouslySelected ? readLayerMeta(previouslySelected).layerId : null;

      canvas
        .loadFromJSON(JSON.parse(json))
        .then((loaded) => {
          if (fabricRef.current !== canvas) return;
          loaded.forEachObject((obj) => {
            const meta = readLayerMeta(obj);
            if (meta.kind === "icon" || meta.kind === "decoration") lockAspectRatio(obj);
          });
          if (selectedLayerId) {
            const again = loaded
              .getObjects()
              .find((obj) => readLayerMeta(obj).layerId === selectedLayerId);
            if (again) loaded.setActiveObject(again);
          }
          // loadFromJSON rebuilds canvas state, so the zoom/pan the sender was
          // working at is re-applied rather than snapping back to fit on undo.
          applyViewport(loaded);
          loaded.requestRenderAll();
          void applyFontPair(loaded, fontPairIdRef.current, canvasWidth, () => fabricRef.current === canvas);
        })
        .finally(() => {
          restoringRef.current = false;
          onChange?.();
          onSelectionChange?.(!!canvas.getActiveObject());
        });
    };

    /** Places a clone of `source` slightly offset from it and selects it. */
    const pasteClone = async (canvas: fabric.Canvas, source: fabric.FabricObject) => {
      const cloned = await source.clone(CUSTOM_OBJECT_PROPS);
      if (fabricRef.current !== canvas) return;
      const meta = readLayerMeta(source);
      stampLayerMeta(cloned, { ...meta, layerId: nextLayerId(), label: uniqueLabel(canvas, meta.label) });
      cloned.set({ left: (cloned.left ?? 0) + 24, top: (cloned.top ?? 0) + 24 });
      if (meta.kind === "icon" || meta.kind === "decoration") lockAspectRatio(cloned);
      canvas.add(cloned);
      canvas.setActiveObject(cloned);
      canvas.requestRenderAll();
      onChange?.();
      onSelectionChange?.(true);
    };

    // Create/dispose the fabric.Canvas instance once per mount. Re-created
    // (not mutated) if readOnly flips, since selection/evented need to be
    // set consistently across every object, not just toggled after the fact.
    useEffect(() => {
      if (!canvasElRef.current) return;
      const canvas = new fabric.Canvas(canvasElRef.current, {
        width: canvasWidth,
        height: canvasHeight,
        backgroundColor,
        selection: !readOnly,
        interactive: !readOnly,
      });
      fabricRef.current = canvas;
      // dispose() nulls fabricRef, and a remount replaces it -- so "is this
      // still the live canvas" is the one check every deferred callback needs
      // before it touches anything.
      const isCurrent = () => fabricRef.current === canvas;

      if (initialJSON) {
        loadedJSONRef.current = initialJSON;
        canvas
          .loadFromJSON(initialJSON)
          .then((loaded) => {
            // The editor can unmount (or StrictMode can remount it) while this
            // load is still in flight; touching the canvas afterwards throws
            // because dispose() has already torn down its 2D context.
            if (!isCurrent()) return;
            loaded.forEachObject((obj) => {
              const meta = readLayerMeta(obj);
              if (meta.kind === "icon" || meta.kind === "decoration") {
                lockAspectRatio(obj);
              }
              if (readOnly) {
                obj.selectable = false;
                obj.evented = false;
              }
            });
            loaded.requestRenderAll();
            // Stored JSON carries no resolved font family (see applyFontPair) --
            // without this pass every restored text object would draw in
            // Fabric's default face, including on the public guest page where
            // nothing else would ever trigger a re-render to correct it.
            void applyFontPair(loaded, fontPairIdRef.current, canvasWidth, isCurrent);
            // The loaded design is history entry zero, so the first undo goes
            // back to "as opened" rather than to a blank canvas.
            undoStackRef.current = [snapshot(loaded)];
            redoStackRef.current = [];
            // Let the parent's layers panel populate with whatever was just
            // loaded -- without this, a freshly opened editor shows an empty
            // layers list until the sender makes their first edit. Uses
            // onReady, not onChange: loading is not an edit.
            if (!readOnly) onReady?.();
          })
          .catch(() => {
            // A design that fails to load leaves an empty canvas rather than
            // an unhandled rejection; the sender can still start over.
          });
      } else {
        undoStackRef.current = [snapshot(canvas)];
        redoStackRef.current = [];
      }

      if (!readOnly) {
        // Editor only -- the guest render has nothing to drag, so there's
        // nothing to snap and no reason to pay for the extra event handlers.
        snapRef.current = initSnapping(canvas, {
          canvasWidth,
          canvasHeight,
          cardBackground: backgroundColor,
        });

        const notifySelection = () => onSelectionChange?.(!!canvas.getActiveObject());
        canvas.on("selection:created", notifySelection);
        canvas.on("selection:updated", notifySelection);
        canvas.on("selection:cleared", notifySelection);
        // Highlighting characters inside a text object isn't a canvas
        // selection change, but the type toolbar has to follow it -- otherwise
        // the Bold button keeps showing the whole object's state while the
        // sender has only a couple of words highlighted.
        canvas.on("text:selection:changed", notifySelection);
        // History is recorded on committed changes only -- object:moving /
        // object:scaling fire continuously while dragging and would otherwise
        // push dozens of near-identical snapshots per gesture.
        canvas.on("object:modified", (e) => {
          // Dragging a side handle is the sender explicitly choosing a wrap
          // width, so the box stops sizing itself from then on. Corner
          // handles scale the whole object instead of changing `width`, so
          // they deliberately leave auto-width alone.
          const action = (e as { action?: string }).action;
          if (e.target instanceof fabric.Textbox && action === "resizing") {
            setAutoWidth(e.target, false);
          }
          recordHistory(canvas);
          onChange?.();
        });
        canvas.on("object:added", (e) => {
          // Central place to stamp per-object interaction policy: this fires
          // for every add path at once -- new elements, templates, paste, and
          // each object restored by loadFromJSON (which is exactly why
          // restoringRef exists below).
          if (e.target) {
            applyRotationSnap(e.target);
            if (e.target instanceof fabric.IText) hideVerticalTextControls(e.target);
          }
          recordHistory(canvas);
        });
        canvas.on("object:removed", () => recordHistory(canvas));
        canvas.on("text:changed", (e) => {
          // Grow/shrink with the text as it's typed, so an auto-width box
          // never wraps early just because it was created around shorter copy.
          const target = e.target;
          if (target instanceof fabric.Textbox && isAutoWidth(target)) {
            fitTextboxToContent(target, canvasWidth);
            canvas.renderAll();
          }
          recordHistory(canvas);
          onChange?.();
        });

        const handleKeyDown = (e: KeyboardEvent) => {
          const target = e.target as HTMLElement | null;
          // Fabric drives text editing through its own hidden <textarea>, so
          // "is the user typing in a form field" has to exclude that one or
          // every shortcut is dead exactly when text is being edited -- which
          // is when the formatting shortcuts matter most. The sidebar's real
          // inputs still count. Fabric tags it with data-fabric="textarea".
          const isFabricTextarea = target?.getAttribute?.("data-fabric") === "textarea";
          const inFormField =
            !!target &&
            !isFabricTextarea &&
            (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
          const active = canvas.getActiveObject();
          const editingText = active instanceof fabric.IText && active.isEditing;

          // Undo/redo: Fabric provides none, and the browser's own undo only
          // applies to DOM inputs, so these have to be wired by hand.
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !inFormField && !editingText) {
            e.preventDefault();
            if (e.shiftKey) {
              const next = redoStackRef.current.pop();
              if (next) {
                undoStackRef.current.push(snapshot(canvas));
                restore(canvas, next);
              }
            } else if (undoStackRef.current.length > 1) {
              const current = undoStackRef.current.pop();
              if (current) redoStackRef.current.push(current);
              const previous = undoStackRef.current[undoStackRef.current.length - 1];
              if (previous) restore(canvas, previous);
            }
            return;
          }
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y" && !inFormField && !editingText) {
            e.preventDefault();
            const next = redoStackRef.current.pop();
            if (next) {
              undoStackRef.current.push(snapshot(canvas));
              restore(canvas, next);
            }
            return;
          }

          // Bold / italic / underline. Unlike the clipboard shortcuts below,
          // these are deliberately allowed *while* editing text: that's the
          // whole point, since a range highlighted mid-edit is what makes
          // "italicise just these three words" possible. applyTextStyle
          // targets the highlighted characters when there are any, and the
          // whole object otherwise.
          if ((e.ctrlKey || e.metaKey) && !inFormField && !e.altKey) {
            const key = e.key.toLowerCase();
            const styleKey = key === "b" ? "bold" : key === "i" ? "italic" : key === "u" ? "underline" : null;
            if (styleKey && active instanceof fabric.IText) {
              e.preventDefault();
              const current = (() => {
                if (styleKey === "bold") return String(readTextStyle(active, "fontWeight") ?? "normal") === "bold";
                if (styleKey === "italic") return readTextStyle(active, "fontStyle") === "italic";
                return !!readTextStyle(active, "underline");
              })();
              if (styleKey === "bold") {
                applyTextStyle(active, { fontWeight: current ? "normal" : "bold" });
              } else if (styleKey === "italic") {
                applyTextStyle(active, { fontStyle: current ? "normal" : "italic" });
              } else {
                applyTextStyle(active, { underline: !current });
              }
              active.initDimensions();
              active.setCoords();
              active.dirty = true;
              canvas.renderAll();
              recordHistory(canvas);
              onChange?.();
              return;
            }
          }

          // Copy / paste / duplicate. Skipped while a text object is in edit
          // mode so Fabric's own in-text copy-paste keeps working there.
          if ((e.ctrlKey || e.metaKey) && !inFormField && !editingText) {
            const key = e.key.toLowerCase();
            if (key === "c" && active) {
              e.preventDefault();
              void active.clone(CUSTOM_OBJECT_PROPS).then((c) => {
                clipboardRef.current = c;
              });
              return;
            }
            if (key === "x" && active) {
              e.preventDefault();
              void active.clone(CUSTOM_OBJECT_PROPS).then((c) => {
                clipboardRef.current = c;
                canvas.remove(active);
                canvas.discardActiveObject();
                canvas.requestRenderAll();
                onChange?.();
              });
              return;
            }
            if (key === "v" && clipboardRef.current) {
              e.preventDefault();
              void pasteClone(canvas, clipboardRef.current);
              return;
            }
            if (key === "d" && active) {
              e.preventDefault();
              void pasteClone(canvas, active);
              return;
            }
          }

          if (e.key !== "Delete" && e.key !== "Backspace") return;
          if (!active) return;
          if (inFormField) return;
          if (editingText) return;
          canvas.remove(active);
          canvas.discardActiveObject();
          canvas.requestRenderAll();
          onChange?.();
        };
        window.addEventListener("keydown", handleKeyDown);

        // --- Zoom and pan -------------------------------------------------
        // Ctrl/Cmd + wheel zooms; a plain wheel is left alone so scrolling
        // over the canvas still scrolls whatever the page would normally
        // scroll, which is what people expect of an embedded canvas.
        const handleWheel = (opt: { e: WheelEvent }) => {
          const e = opt.e;
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          e.stopPropagation();
          zoomAtPoint(
            canvas,
            userZoomRef.current * Math.pow(0.999, e.deltaY),
            canvas.getViewportPoint(e),
          );
        };
        canvas.on("mouse:wheel", handleWheel);

        let panning = false;
        let spaceHeld = false;
        let lastClient = { x: 0, y: 0 };

        // skipTargetFind is the clean way to make space+drag pan instead of
        // grabbing whatever is under the cursor: with no target found, Fabric
        // starts neither an object transform nor a selection marquee.
        const setSpaceHeld = (held: boolean) => {
          if (spaceHeld === held) return;
          spaceHeld = held;
          canvas.skipTargetFind = held;
          canvas.selection = !held;
          canvas.defaultCursor = held ? "grab" : "default";
          canvas.setCursor(held ? "grab" : "default");
        };

        const handleSpaceDown = (e: KeyboardEvent) => {
          if (e.code !== "Space") return;
          const target = e.target as HTMLElement | null;
          // Space is a literal character while typing, and it also activates a
          // focused button -- neither should start a pan.
          if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
          const active = canvas.getActiveObject();
          if (active instanceof fabric.IText && active.isEditing) return;
          e.preventDefault();
          setSpaceHeld(true);
        };
        const handleSpaceUp = (e: KeyboardEvent) => {
          if (e.code === "Space") setSpaceHeld(false);
        };
        // A pan left mid-gesture by an alt-tab would otherwise stay stuck on.
        const handleBlur = () => {
          setSpaceHeld(false);
          panning = false;
        };
        window.addEventListener("keydown", handleSpaceDown);
        window.addEventListener("keyup", handleSpaceUp);
        window.addEventListener("blur", handleBlur);

        const handlePanStart = (opt: { e: MouseEvent | TouchEvent }) => {
          const e = opt.e as MouseEvent;
          if (!spaceHeld && e.button !== 1) return;
          panning = true;
          lastClient = { x: e.clientX, y: e.clientY };
          canvas.setCursor("grabbing");
        };
        const handlePanMove = (opt: { e: MouseEvent | TouchEvent }) => {
          if (!panning) return;
          const e = opt.e as MouseEvent;
          panRef.current = {
            x: panRef.current.x + (e.clientX - lastClient.x),
            y: panRef.current.y + (e.clientY - lastClient.y),
          };
          lastClient = { x: e.clientX, y: e.clientY };
          applyViewport(canvas);
        };
        const handlePanEnd = () => {
          if (!panning) return;
          panning = false;
          canvas.setCursor(spaceHeld ? "grab" : "default");
        };
        canvas.on("mouse:down", handlePanStart);
        canvas.on("mouse:move", handlePanMove);
        canvas.on("mouse:up", handlePanEnd);

        return () => {
          window.removeEventListener("keydown", handleKeyDown);
          window.removeEventListener("keydown", handleSpaceDown);
          window.removeEventListener("keyup", handleSpaceUp);
          window.removeEventListener("blur", handleBlur);
          canvas.off("mouse:wheel", handleWheel);
          canvas.off("mouse:down", handlePanStart);
          canvas.off("mouse:move", handlePanMove);
          canvas.off("mouse:up", handlePanEnd);
          // Before canvas.dispose(): the guidelines hold canvas event
          // subscriptions of their own that have to come off first.
          snapRef.current?.dispose();
          snapRef.current = null;
          canvas.dispose();
          fabricRef.current = null;
        };
      }

      return () => {
        canvas.dispose();
        fabricRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only re-run on readOnly change; canvasWidth/Height/initialJSON changes are handled by loadFromJSON above running fresh on genuine remounts, not by reacting to every prop tick
    }, [readOnly]);

    // Measure the actual DOM container and scale the fixed logical canvas to
    // fit it via Fabric's own zoom, rather than re-laying-out object
    // positions -- keeps canvasJSON coordinates meaningful at any render size.
    useEffect(() => {
      if (!containerRef.current) return;
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
        }
      });
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas || containerSize.width === 0 || containerSize.height === 0) return;
      const fit = Math.min(containerSize.width / canvasWidth, containerSize.height / canvasHeight);
      fitZoomRef.current = fit;
      // The <canvas> element stays the size of the fitted card: it's the
      // window onto the design, and zooming changes what's shown *through* it
      // rather than making the element itself grow.
      canvas.setDimensions({ width: canvasWidth * fit, height: canvasHeight * fit });
      applyViewport(canvas);
    }, [containerSize, canvasWidth, canvasHeight, applyViewport]);

    // Keep the canvas's own background in sync with palette changes made
    // after the initial mount (e.g. switching palettes in the Style tab).
    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      canvas.backgroundColor = backgroundColor;
      // Guide lines are drawn onto the card itself, so their colour has to be
      // re-picked whenever the card's background changes or they can end up
      // invisible against it.
      snapRef.current?.setCardBackground(backgroundColor);
      canvas.requestRenderAll();
    }, [backgroundColor]);

    // Switching font pair in the Style tab re-resolves and re-applies the
    // family to every existing text object, rather than only affecting text
    // added afterwards.
    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      void applyFontPair(canvas, fontPairId, canvasWidth, () => fabricRef.current === canvas);
    }, [fontPairId, canvasWidth]);

    // Guest-side live refresh: GuestEventView refetches the event on the
    // `db-changed` broadcast and hands down new canvasJSON, but the canvas is
    // only built once on mount -- so without this the guest kept seeing the
    // design as it was when their page first loaded. Reloading in place (not
    // rebuilding the canvas) is the documented Fabric pattern for a changed
    // scene. Editor-side is deliberately excluded: there, `initialJSON`
    // changes as a side effect of the sender's own save, and reloading would
    // wipe their selection mid-edit.
    useEffect(() => {
      if (!readOnly) return;
      const canvas = fabricRef.current;
      if (!canvas || !initialJSON) return;
      if (loadedJSONRef.current === initialJSON) return;
      loadedJSONRef.current = initialJSON;
      const isCurrent = () => fabricRef.current === canvas;
      canvas
        .loadFromJSON(initialJSON)
        .then((loaded) => {
          if (!isCurrent()) return;
          loaded.forEachObject((obj) => {
            obj.selectable = false;
            obj.evented = false;
          });
          applyViewport(loaded);
          loaded.requestRenderAll();
          void applyFontPair(loaded, fontPairIdRef.current, canvasWidth, isCurrent);
        })
        .catch(() => {
          // Keep showing the previously loaded design rather than blanking it.
        });
    }, [initialJSON, readOnly, applyViewport, canvasWidth]);

    useImperativeHandle(ref, () => ({
      addText: (role: DesignFontRole) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const families = resolveFontPairFamilies(fontPairIdRef.current);
        // Textbox, not IText: it wraps at a fixed width, so a long line can
        // never run off the edge of the card the way unwrapped text did.
        const text = new fabric.Textbox(role === "display" ? "Your heading" : "Your text here", {
          left: canvasWidth / 2,
          top: canvasHeight / 2,
          width: canvasWidth * 0.8,
          originX: "center",
          originY: "center",
          textAlign: "center",
          fontSize: role === "display" ? 72 : 36,
          // Was hardcoded #000000, which made every new text object invisible
          // on a dark card until the sender manually recoloured it.
          fill: textColorRef.current,
          fontFamily: families[role] || undefined,
        });
        stampLayerMeta(text, {
          layerId: nextLayerId(),
          kind: "text",
          label: uniqueLabel(canvas, role === "display" ? "Heading" : "Text"),
          fontRole: role,
        });
        // New text hugs its own content rather than sitting in a box 80% of
        // the card wide, which is what made a short heading look like it had
        // huge invisible margins.
        setAutoWidth(text, true);
        fitTextboxToContent(text, canvasWidth);
        canvas.add(text);
        canvas.setActiveObject(text);
        canvas.requestRenderAll();
        // The family may still be mid-fetch on first use; reapplying once it
        // resolves is what makes the text actually switch out of the fallback.
        void ensureFontsLoaded([families[role]]).then(() => {
          if (fabricRef.current !== canvas) return;
          text.set({ fontFamily: families[role] || undefined });
          // The real face is a different width than the fallback was.
          if (isAutoWidth(text)) fitTextboxToContent(text, canvasWidth);
          canvas.requestRenderAll();
        });
        onChange?.();
      },
      addImage: async (dataUrl: string, label?: string) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const img = await fabric.FabricImage.fromURL(dataUrl);
        // Decoding is async; the editor may have unmounted meanwhile.
        if (fabricRef.current !== canvas) return;
        const maxDim = Math.min(canvasWidth, canvasHeight) * 0.6;
        const scale = Math.min(1, maxDim / Math.max(img.width ?? 1, img.height ?? 1));
        img.set({
          left: canvasWidth / 2,
          top: canvasHeight / 2,
          originX: "center",
          originY: "center",
          scaleX: scale,
          scaleY: scale,
        });
        // Images are the one kind explicitly exempted from the ratio lock --
        // free non-uniform resize (crop-to-fit a specific box) stays available.
        // Labelled with the original filename where we have it: a sender who
        // named a file deliberately shouldn't see three rows all called "Image".
        stampLayerMeta(img, {
          layerId: nextLayerId(),
          kind: "image",
          label: uniqueLabel(canvas, label ? shortenFileName(label) : "Image"),
        });
        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.requestRenderAll();
        onChange?.();
      },
      addIcon: (icon: DesignIconOption, color: string) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        // lucide-react icons are stroke-based (not filled), so add as a
        // stroke path -- fill stays transparent, stroke carries the color.
        const svgString = renderLucideIconToSvgString(icon);
        fabric.loadSVGFromString(svgString).then(({ objects }) => {
          if (fabricRef.current !== canvas) return;
          const validObjects = objects.filter((o): o is fabric.FabricObject => o !== null);
          const group = new fabric.Group(validObjects);
          group.set({
            left: canvasWidth / 2,
            top: canvasHeight / 2,
            originX: "center",
            originY: "center",
            scaleX: 3,
            scaleY: 3,
          });
          group.forEachObject((obj) => obj.set({ stroke: color }));
          stampLayerMeta(group, { layerId: nextLayerId(), kind: "icon", label: uniqueLabel(canvas, icon.name) });
          lockAspectRatio(group);
          canvas.add(group);
          canvas.setActiveObject(group);
          canvas.requestRenderAll();
          onChange?.();
        });
      },
      addDecoration: (decoration: DesignDecorationOption, color: string) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const path = new fabric.Path(buildCompoundPath(decoration.paths), {
          left: canvasWidth / 2,
          top: canvasHeight / 2,
          originX: "center",
          originY: "center",
          fill: color,
          scaleX: 2,
          scaleY: 2,
        });
        stampLayerMeta(path, { layerId: nextLayerId(), kind: "decoration", label: uniqueLabel(canvas, decoration.name) });
        lockAspectRatio(path);
        canvas.add(path);
        canvas.setActiveObject(path);
        canvas.requestRenderAll();
        onChange?.();
      },
      deleteSelected: () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const active = canvas.getActiveObject();
        if (!active) return;
        canvas.remove(active);
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        onChange?.();
      },
      duplicateSelected: async () => {
        const canvas = fabricRef.current;
        const active = canvas?.getActiveObject();
        if (!canvas || !active) return;
        // Same path as Ctrl+D / Ctrl+V so the button and the shortcut can't
        // drift apart. clone() returns a Promise in Fabric v6+ (v5 took a callback).
        await pasteClone(canvas, active);
      },
      bringSelectedToFront: () => {
        const canvas = fabricRef.current;
        const active = canvas?.getActiveObject();
        if (!canvas || !active) return;
        canvas.bringObjectToFront(active);
        canvas.requestRenderAll();
        onChange?.();
      },
      sendSelectedToBack: () => {
        const canvas = fabricRef.current;
        const active = canvas?.getActiveObject();
        if (!canvas || !active) return;
        canvas.sendObjectToBack(active);
        canvas.requestRenderAll();
        onChange?.();
      },
      recolorSelected: (color: string) => {
        const canvas = fabricRef.current;
        const active = canvas?.getActiveObject();
        if (!canvas || !active) return;
        if (active instanceof fabric.IText) {
          // Range-aware like the other text properties, so a single word can
          // be recoloured without splitting it into its own text object.
          applyTextStyle(active, { fill: color });
          active.dirty = true;
        } else if (active instanceof fabric.Group) {
          active.forEachObject((obj) => obj.set({ stroke: color, fill: obj.fill ? color : obj.fill }));
        } else {
          active.set({ fill: color });
        }
        canvas.requestRenderAll();
        onChange?.();
      },
      getSelectedColor: () => {
        const active = fabricRef.current?.getActiveObject();
        if (!active) return null;
        // Groups (icons) carry their colour on the child paths' stroke, not
        // on the group itself, so read through to the first child.
        if (active instanceof fabric.Group) {
          const first = active.getObjects()[0];
          const value = first?.stroke ?? first?.fill;
          return typeof value === "string" ? value : null;
        }
        return typeof active.fill === "string" ? active.fill : null;
      },
      getSelectedTextProps: () => {
        const active = fabricRef.current?.getActiveObject();
        if (!(active instanceof fabric.IText)) return null;
        const range = activeTextRange(active);
        const charFontKey = readTextStyle(active, CHAR_FONT_KEY);
        return {
          fontSize: (readTextStyle(active, "fontSize") as number) ?? active.fontSize ?? 48,
          // Fabric stores these as CSS-ish values, not booleans -- normalized
          // here so the sidebar can just render toggle buttons.
          bold: String(readTextStyle(active, "fontWeight") ?? "normal") === "bold",
          italic: readTextStyle(active, "fontStyle") === "italic",
          underline: !!readTextStyle(active, "underline"),
          // textAlign is a whole-object property in Fabric; it has no
          // per-character form, so it's always read off the object.
          textAlign: active.textAlign ?? "left",
          fontFamilyId: range
            ? typeof charFontKey === "string"
              ? charFontKey
              : null
            : readLayerMeta(active).fontFamilyId ?? null,
          partialSelection: !!range,
        };
      },
      setSelectedTextProps: (props: Partial<SelectedTextProps>) => {
        const canvas = fabricRef.current;
        const active = canvas?.getActiveObject();
        if (!canvas || !(active instanceof fabric.IText)) return;
        if (props.fontSize !== undefined) applyTextStyle(active, { fontSize: props.fontSize });
        if (props.bold !== undefined) {
          applyTextStyle(active, { fontWeight: props.bold ? "bold" : "normal" });
        }
        if (props.italic !== undefined) {
          applyTextStyle(active, { fontStyle: props.italic ? "italic" : "normal" });
        }
        if (props.underline !== undefined) applyTextStyle(active, { underline: props.underline });
        // Alignment has no per-character equivalent, so it always applies to
        // the whole object even when only a few characters are highlighted.
        if (props.textAlign !== undefined) active.set({ textAlign: props.textAlign });
        // Changing size/weight changes the measured box, so the object has to
        // recompute its dimensions before the next render or the selection
        // handles sit in the old place.
        active.initDimensions();
        active.setCoords();
        active.dirty = true;
        // Synchronous for the same reason as applyFontPair -- a deferred
        // render can be throttled away in a background tab.
        canvas.renderAll();
        recordHistory(canvas);
        onChange?.();
      },
      setSelectedFontFamily: async (familyId: string) => {
        const canvas = fabricRef.current;
        const active = canvas?.getActiveObject();
        if (!canvas || !(active instanceof fabric.IText)) return;
        const meta = readLayerMeta(active);
        const pairFamilies = resolveFontPairFamilies(fontPairIdRef.current);
        const family = familyId
          ? resolveFontFamilyById(familyId)
          : pairFamilies[meta.fontRole ?? "display"];
        if (!family) return;
        // The face may never have been painted with before, and a canvas draw
        // doesn't itself trigger the fetch -- without this the text switches
        // to the fallback and stays there.
        await ensureFontsLoaded([family]);
        if (fabricRef.current !== canvas) return;

        const range = activeTextRange(active);
        if (!familyId) {
          // Reset always applies to the whole box: Fabric's setSelectionStyles
          // merges rather than deletes, so clearing a single run's override
          // would mean hand-editing the style map for those indices, and
          // "put this text box back to the card font" is the useful action
          // anyway.
          stampLayerMeta(active, { ...meta, fontFamilyId: undefined });
          clearCharacterStyleKeys(active, ["fontFamily", CHAR_FONT_KEY]);
          active.set({ fontFamily: family });
        } else if (range) {
          // The resolved family rides along with the stable marker on purpose --
          // see CHAR_FONT_KEY for why a marker on its own gets dropped.
          active.setSelectionStyles(
            { fontFamily: family, [CHAR_FONT_KEY]: familyId },
            range.start,
            range.end,
          );
        } else {
          active.set({ fontFamily: family });
          stampLayerMeta(active, { ...meta, fontFamilyId: familyId });
          clearCharacterStyleKeys(active, ["fontFamily", CHAR_FONT_KEY]);
        }

        active.initDimensions();
        active.setCoords();
        active.dirty = true;
        canvas.renderAll();
        recordHistory(canvas);
        onChange?.();
      },
      undo: () => {
        const canvas = fabricRef.current;
        if (!canvas || undoStackRef.current.length <= 1) return;
        const current = undoStackRef.current.pop();
        if (current) redoStackRef.current.push(current);
        const previous = undoStackRef.current[undoStackRef.current.length - 1];
        if (previous) restore(canvas, previous);
      },
      redo: () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const next = redoStackRef.current.pop();
        if (!next) return;
        undoStackRef.current.push(snapshot(canvas));
        restore(canvas, next);
      },
      canUndo: () => undoStackRef.current.length > 1,
      canRedo: () => redoStackRef.current.length > 0,
      applyTemplate: async (template) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const families = resolveFontPairFamilies(template.fontPairId);
        await ensureFontsLoaded([families.display, families.body]);
        if (fabricRef.current !== canvas) return;

        canvas.remove(...canvas.getObjects());
        canvas.backgroundColor = template.colors.background;

        const px = (pct: number) => (pct / 100) * canvasWidth;
        const py = (pct: number) => (pct / 100) * canvasHeight;

        for (const el of template.elements) {
          if (el.kind === "text") {
            const text = new fabric.Textbox(el.uppercase ? el.text.toUpperCase() : el.text, {
              left: px(el.xPct),
              top: py(el.yPct),
              // Bounded so a headline wraps inside the card rather than
              // spilling past both edges, whatever font is in play.
              width: canvasWidth * 0.84,
              originX: "center",
              originY: "center",
              fontSize: px(el.fontSizePct),
              fill: template.colors[el.color],
              fontFamily: families[el.role] || undefined,
              fontWeight: el.bold ? "bold" : "normal",
              fontStyle: el.italic ? "italic" : "normal",
              charSpacing: el.letterSpacing ?? 0,
              textAlign: "center",
            });
            stampLayerMeta(text, {
              layerId: nextLayerId(),
              kind: "text",
              // Label from the copy itself so the layers list reads like the
              // card rather than "Text, Text, Text".
              label: uniqueLabel(canvas, el.text.length > 24 ? `${el.text.slice(0, 21)}...` : el.text),
              fontRole: el.role,
            });
            // Template text hugs its copy for the same reason new text does --
            // a template is a starting point, and its boxes should look as
            // tidy as anything the sender adds by hand.
            setAutoWidth(text, true);
            fitTextboxToContent(text, canvasWidth);
            canvas.add(text);
            continue;
          }

          if (el.kind === "icon") {
            const icon = getDesignIcon(el.iconId);
            if (!icon) continue;
            const { objects } = await fabric.loadSVGFromString(renderLucideIconToSvgString(icon));
            if (fabricRef.current !== canvas) return;
            const group = new fabric.Group(objects.filter((o): o is fabric.FabricObject => o !== null));
            group.set({
              left: px(el.xPct),
              top: py(el.yPct),
              originX: "center",
              originY: "center",
              scaleX: el.scale,
              scaleY: el.scale,
            });
            group.forEachObject((o) => o.set({ stroke: template.colors.accent }));
            stampLayerMeta(group, { layerId: nextLayerId(), kind: "icon", label: uniqueLabel(canvas, icon.name) });
            lockAspectRatio(group);
            canvas.add(group);
            continue;
          }

          const decoration = getDesignDecoration(el.decorationId);
          if (!decoration) continue;
          const path = new fabric.Path(buildCompoundPath(decoration.paths), {
            left: px(el.xPct),
            top: py(el.yPct),
            originX: "center",
            originY: "center",
            fill: template.colors.accent,
            scaleX: el.scale,
            scaleY: el.scale,
          });
          stampLayerMeta(path, {
            layerId: nextLayerId(),
            kind: "decoration",
            label: uniqueLabel(canvas, decoration.name),
          });
          lockAspectRatio(path);
          canvas.add(path);
        }

        canvas.discardActiveObject();
        canvas.renderAll();
        recordHistory(canvas);
        onChange?.();
        onSelectionChange?.(false);
      },
      recolorAllToPalette: (colors) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        for (const obj of canvas.getObjects()) {
          const meta = readLayerMeta(obj);
          if (obj instanceof fabric.IText) {
            // Headings take the primary text colour, body copy the muted one --
            // the same split new text already uses.
            obj.set({ fill: meta.fontRole === "body" ? colors.textMuted : colors.text });
            obj.dirty = true;
          } else if (obj instanceof fabric.Group) {
            obj.forEachObject((child) => child.set({ stroke: colors.accent, fill: child.fill ? colors.accent : child.fill }));
            obj.dirty = true;
          } else if (meta.kind === "decoration") {
            obj.set({ fill: colors.accent });
            obj.dirty = true;
          }
        }
        canvas.renderAll();
        recordHistory(canvas);
        onChange?.();
      },
      getJSON: () => {
        const canvas = fabricRef.current;
        // toObject (not toJSON) so the layerId/kind/label/fontRole stamped on
        // each object round-trips -- Fabric strips any non-standard property
        // from plain toJSON() unless explicitly told to keep it.
        return canvas ? (canvas.toObject(CUSTOM_OBJECT_PROPS) as Record<string, unknown>) : { objects: [] };
      },
      hasSelection: () => !!fabricRef.current?.getActiveObject(),
      getLayers: () => {
        const canvas = fabricRef.current;
        if (!canvas) return [];
        // getObjects() returns back-to-front; a layers panel reads top-to-bottom.
        return canvas
          .getObjects()
          .slice()
          .reverse()
          .map((obj) => {
            const meta = readLayerMeta(obj);
            return { layerId: meta.layerId, kind: meta.kind, label: meta.label };
          });
      },
      selectLayer: (layerId: string) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const target = canvas.getObjects().find((obj) => readLayerMeta(obj).layerId === layerId);
        if (!target) return;
        canvas.setActiveObject(target);
        canvas.requestRenderAll();
        onSelectionChange?.(true);
      },
      moveLayer: (layerId: string, toFrontIndex: number) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const objects = canvas.getObjects();
        const target = objects.find((obj) => readLayerMeta(obj).layerId === layerId);
        if (!target) return;
        // toFrontIndex is 0 = frontmost (matches getLayers' front-first order);
        // moveObjectTo's index is back-to-front, so it needs inverting.
        const backIndex = Math.max(0, objects.length - 1 - toFrontIndex);
        canvas.moveObjectTo(target, backIndex);
        canvas.requestRenderAll();
        onChange?.();
      },
      deleteLayer: (layerId: string) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const target = canvas.getObjects().find((obj) => readLayerMeta(obj).layerId === layerId);
        if (!target) return;
        canvas.remove(target);
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        onChange?.();
      },
      zoomBy: (factor: number) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        // Button zoom works from the middle of the view, so repeated clicks
        // stay centred instead of creeping toward a corner.
        zoomAtPoint(canvas, userZoomRef.current * factor, {
          x: (canvasWidth * fitZoomRef.current) / 2,
          y: (canvasHeight * fitZoomRef.current) / 2,
        });
      },
      zoomToFit: () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        userZoomRef.current = 1;
        panRef.current = { x: 0, y: 0 };
        applyViewport(canvas);
      },
    }));

    return (
      <div
        ref={containerRef}
        className={className}
        style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <canvas ref={canvasElRef} />
      </div>
    );
  },
);

/**
 * lucide-react exposes each icon as a forwardRef React component, not a raw
 * SVG string -- renderToStaticMarkup is the standard, correct tool for
 * "React element -> HTML/SVG string" and handles forwardRef components
 * properly (a hand-rolled prop serializer would need to special-case that).
 */
function renderLucideIconToSvgString(icon: DesignIconOption): string {
  const IconComponent = icon.Icon;
  return renderToStaticMarkup(createElement(IconComponent, { size: 24, strokeWidth: 2 }));
}

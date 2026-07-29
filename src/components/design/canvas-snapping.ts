"use client";

import * as fabric from "fabric";
import { AligningGuidelines } from "fabric/extensions";

/**
 * Canva-style snapping + alignment guides for the design canvas.
 *
 * Fabric v7 ships an official `AligningGuidelines` extension that already
 * does the hard part -- collecting each other object's six candidate snap
 * values (left / centre-x / right and top / centre-y / bottom), picking the
 * nearest one per axis, moving the dragged object onto it, and drawing the
 * guide line. It measures the snap threshold in *screen* pixels (it divides
 * by `canvas.getZoom()` internally), which is what makes snapping feel the
 * same however large the card is rendered.
 *
 * What it does NOT do is snap to the page itself -- no card centre, no card
 * edges, no margins. On an invitation that's the single most useful guide
 * there is, so rather than forking the extension this module feeds it two
 * *phantom* rectangles through its documented `getObjectsByTarget` hook:
 * one covering the whole card and one inset to a safe-area margin. The
 * extension's point collector only ever reads `getCoords()` and
 * `getCenterPoint()` off what it's given, so a full-card rect contributes
 * exactly x = {0, W/2, W} and y = {0, H/2, H} -- card edges and card centre,
 * for free. The phantoms are deliberately never added to the canvas, so they
 * can't render, can't be selected, and can't end up in the saved canvasJSON.
 */

/**
 * Guide lines are drawn onto the card, whose background colour the sender
 * picks freely -- so a single fixed colour (or a theme token) can and does
 * become invisible on some cards. Two vivid, widely-separated hues are kept
 * and whichever contrasts better with the current card background is used.
 */
const GUIDE_MAGENTA = "#FF2D95";
const GUIDE_CYAN = "#00D1C1";

/** Snap threshold in screen pixels -- the extension converts to canvas units by zoom. */
const SNAP_THRESHOLD_PX = 6;

/** Safe-area guide inset, as a fraction of the shorter card edge. */
const SAFE_AREA_FRACTION = 0.06;

/** Rotation snaps to multiples of this, matching every mainstream design tool. */
const ROTATION_SNAP_DEGREES = 15;

/** How close (in screen px) rotation has to be before it snaps. */
const ROTATION_SNAP_THRESHOLD = 7;

/**
 * A dragged object's scene-space bounding box. Built from getCoords() rather
 * than getBoundingRect() so it's unambiguously in the same coordinate space
 * the aligning-guidelines extension works in.
 */
type Box = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
};

function sceneBox(obj: fabric.FabricObject): Box {
  const points = obj.getCoords();
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return { left, top, right, bottom, centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
}

/** One equal-gap indicator to draw: a bar spanning `from`..`to` along `axis`. */
type GapMarker = { axis: "x" | "y"; from: number; to: number; at: number };

/**
 * Spacing bars are nudged off the objects' shared centre line. When a row of
 * equal-height elements lines up, the alignment pass is already drawing a
 * line straight through their middle, and putting the gap bars in the same
 * place turned the two hints into one unreadable smear.
 */
const GAP_MARKER_OFFSET_PX = 9;

/**
 * Equal-spacing detection -- the behaviour that makes a design tool feel like
 * it's doing maths for you rather than just catching edges.
 *
 * Two situations are recognised along each axis, both only considering peers
 * that actually overlap on the *other* axis (spacing between things that
 * aren't even side by side is meaningless):
 *
 *  1. Centred between two neighbours: the object is dropped between A and B,
 *     and lands so gap(A, object) === gap(object, B).
 *  2. Continuing a rhythm: A and B are already evenly spaced, and the object
 *     is placed beyond them at that same gap.
 *
 * Returns the correction to apply plus the gaps to draw, or null when nothing
 * is close enough to be worth snapping to.
 */
function findEqualSpacing(
  target: Box,
  peers: Box[],
  axis: "x" | "y",
  threshold: number,
): { delta: number; markers: GapMarker[] } | null {
  const startKey = axis === "x" ? "left" : "top";
  const endKey = axis === "x" ? "right" : "bottom";
  const crossStart = axis === "x" ? "top" : "left";
  const crossEnd = axis === "x" ? "bottom" : "right";
  const crossCenter = axis === "x" ? "centerY" : "centerX";

  const overlapping = peers.filter(
    (p) => p[crossEnd] > target[crossStart] && p[crossStart] < target[crossEnd],
  );
  if (overlapping.length < 2) return null;

  const sorted = [...overlapping].sort((a, b) => a[startKey] - b[startKey]);
  const before = sorted.filter((p) => p[endKey] <= target[startKey]);
  const after = sorted.filter((p) => p[startKey] >= target[endKey]);

  const size = target[endKey] - target[startKey];
  const lane = (a: Box, b: Box) => (a[crossCenter] + b[crossCenter]) / 2;

  // 1. Sitting between two neighbours -- centre it in the space they leave.
  const left = before[before.length - 1];
  const right = after[0];
  if (left && right) {
    const free = right[startKey] - left[endKey];
    if (free > size) {
      const gap = (free - size) / 2;
      const desiredStart = left[endKey] + gap;
      const delta = desiredStart - target[startKey];
      if (Math.abs(delta) <= threshold) {
        const at = lane(left, right);
        return {
          delta,
          markers: [
            { axis, from: left[endKey], to: desiredStart, at },
            { axis, from: desiredStart + size, to: right[startKey], at },
          ],
        };
      }
    }
  }

  // 2. Extending an existing rhythm outwards in either direction.
  const series: { anchor: Box; neighbour: Box; direction: 1 | -1 }[] = [];
  if (before.length >= 2) {
    series.push({
      anchor: before[before.length - 1],
      neighbour: before[before.length - 2],
      direction: 1,
    });
  }
  if (after.length >= 2) {
    series.push({ anchor: after[0], neighbour: after[1], direction: -1 });
  }

  for (const { anchor, neighbour, direction } of series) {
    const gap =
      direction === 1 ? anchor[startKey] - neighbour[endKey] : neighbour[startKey] - anchor[endKey];
    if (gap <= 0) continue;
    const desiredStart =
      direction === 1 ? anchor[endKey] + gap : anchor[startKey] - gap - size;
    const delta = desiredStart - target[startKey];
    if (Math.abs(delta) > threshold) continue;

    const at = lane(anchor, neighbour);
    const existing: GapMarker =
      direction === 1
        ? { axis, from: neighbour[endKey], to: anchor[startKey], at }
        : { axis, from: anchor[endKey], to: neighbour[startKey], at };
    const created: GapMarker =
      direction === 1
        ? { axis, from: anchor[endKey], to: desiredStart, at }
        : { axis, from: desiredStart + size, to: anchor[startKey], at };
    return { delta, markers: [existing, created] };
  }

  return null;
}

function drawGapMarkers(canvas: fabric.Canvas, markers: GapMarker[], color: string) {
  if (markers.length === 0) return;
  const ctx = canvas.getTopContext();
  const zoom = canvas.getZoom();
  const tick = 4 / zoom;
  const offset = GAP_MARKER_OFFSET_PX / zoom;

  ctx.save();
  ctx.transform(...canvas.viewportTransform);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1 / zoom;
  ctx.beginPath();
  for (const marker of markers) {
    if (marker.axis === "x") {
      const at = marker.at + offset;
      ctx.moveTo(marker.from, at);
      ctx.lineTo(marker.to, at);
      // End caps, so a gap bar reads as a measurement rather than a stray line.
      ctx.moveTo(marker.from, at - tick);
      ctx.lineTo(marker.from, at + tick);
      ctx.moveTo(marker.to, at - tick);
      ctx.lineTo(marker.to, at + tick);
    } else {
      const at = marker.at + offset;
      ctx.moveTo(at, marker.from);
      ctx.lineTo(at, marker.to);
      ctx.moveTo(at - tick, marker.from);
      ctx.lineTo(at + tick, marker.from);
      ctx.moveTo(at - tick, marker.to);
      ctx.lineTo(at + tick, marker.to);
    }
  }
  ctx.stroke();
  ctx.restore();
}

export type SnapController = {
  /** Re-picks the guide colour when the sender changes the card background. */
  setCardBackground: (color: string) => void;
  dispose: () => void;
};

function relativeLuminance(hex: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return 1;
  const int = parseInt(match[1], 16);
  const channels = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function pickGuideColor(background: string): string {
  return contrastRatio(GUIDE_MAGENTA, background) >= contrastRatio(GUIDE_CYAN, background)
    ? GUIDE_MAGENTA
    : GUIDE_CYAN;
}

/**
 * A rectangle that exists only to contribute snap points. Never added to the
 * canvas -- `getCoords()` is computed from the object's own transform matrix,
 * so it doesn't need a parent to report correct scene coordinates.
 * strokeWidth 0 keeps its corners exactly on the intended coordinates rather
 * than half a stroke outside them.
 */
function phantomRect(left: number, top: number, width: number, height: number): fabric.Rect {
  const rect = new fabric.Rect({
    left,
    top,
    width,
    height,
    strokeWidth: 0,
    originX: "left",
    originY: "top",
    selectable: false,
    evented: false,
  });
  rect.setCoords();
  return rect;
}

/**
 * Makes an object snap its rotation to 15 degree increments. Fabric supports
 * this natively per object, so it only has to be stamped on -- there's no
 * event handling involved.
 */
export function applyRotationSnap(obj: fabric.FabricObject) {
  obj.snapAngle = ROTATION_SNAP_DEGREES;
  obj.snapThreshold = ROTATION_SNAP_THRESHOLD;
}

export function initSnapping(
  canvas: fabric.Canvas,
  options: { canvasWidth: number; canvasHeight: number; cardBackground: string },
): SnapController {
  const { canvasWidth, canvasHeight, cardBackground } = options;

  const inset = Math.round(Math.min(canvasWidth, canvasHeight) * SAFE_AREA_FRACTION);
  const cardBounds = phantomRect(0, 0, canvasWidth, canvasHeight);
  const safeArea = phantomRect(inset, inset, canvasWidth - inset * 2, canvasHeight - inset * 2);

  // Held down to temporarily suppress snapping, the standard escape hatch for
  // "the guides won't let me put it where I actually want it". Ctrl is used
  // rather than Alt or Shift because Fabric already reserves those for
  // centred scaling and uniform scaling respectively. Tracked from key events
  // instead of the drag event because `getObjectsByTarget` isn't handed one.
  let suppressed = false;
  const onKeyChange = (e: KeyboardEvent) => {
    suppressed = e.ctrlKey || e.metaKey;
  };
  // Releasing the key while the window is unfocused never fires keyup, which
  // would otherwise leave snapping suppressed forever.
  const onBlur = () => {
    suppressed = false;
  };
  window.addEventListener("keydown", onKeyChange);
  window.addEventListener("keyup", onKeyChange);
  window.addEventListener("blur", onBlur);

  const guidelines = new AligningGuidelines(canvas, {
    margin: SNAP_THRESHOLD_PX,
    width: 1,
    color: pickGuideColor(cardBackground),
    // Small: a row of equal-height elements can legitimately match on top,
    // centre and bottom at once, and full-size end markers on three parallel
    // lines turned a helpful hint into clutter.
    xSize: 2,
    getObjectsByTarget: (target) => {
      const set = new Set<fabric.FabricObject>();
      if (suppressed) return set;

      // Children of a multi-object selection travel with the selection, so
      // aligning to them would mean aligning something to itself.
      const movingTogether =
        target instanceof fabric.ActiveSelection ? new Set(target.getObjects()) : null;

      for (const obj of canvas.getObjects()) {
        if (obj === target) continue;
        if (movingTogether?.has(obj)) continue;
        set.add(obj);
      }

      set.add(cardBounds);
      set.add(safeArea);
      return set;
    },
  });

  // Equal-spacing pass. Registered after the guidelines so it runs second and
  // can defer to them: edge/centre alignment is the stronger signal, so
  // spacing only adjusts an axis the guidelines left alone. Their
  // verticalLines / horizontalLines sets are the record of what they just
  // matched -- vertical lines mean an x-axis snap, horizontal a y-axis one.
  let markers: GapMarker[] = [];

  const onMoving = (e: { target?: fabric.FabricObject }) => {
    markers = [];
    const target = e.target;
    if (!target || suppressed) return;

    const movingTogether =
      target instanceof fabric.ActiveSelection ? new Set(target.getObjects()) : null;
    // The card and safe-area phantoms are deliberately excluded here: spacing
    // is about rhythm between real elements, and a box covering the whole card
    // would otherwise register as a neighbour to everything.
    const peers = canvas
      .getObjects()
      .filter((obj) => obj !== target && !movingTogether?.has(obj))
      .map(sceneBox);
    if (peers.length < 2) return;

    const threshold = SNAP_THRESHOLD_PX / canvas.getZoom();

    if (guidelines.verticalLines.size === 0) {
      const match = findEqualSpacing(sceneBox(target), peers, "x", threshold);
      if (match) {
        target.set({ left: (target.left ?? 0) + match.delta });
        target.setCoords();
        markers.push(...match.markers);
      }
    }
    if (guidelines.horizontalLines.size === 0) {
      // Recomputed from the possibly-just-moved object, so the two axes can't
      // disagree about where it currently is.
      const match = findEqualSpacing(sceneBox(target), peers, "y", threshold);
      if (match) {
        target.set({ top: (target.top ?? 0) + match.delta });
        target.setCoords();
        markers.push(...match.markers);
      }
    }
  };

  // The guidelines clear contextTop in before:render and draw in after:render,
  // so drawing here too puts both kinds of hint on the same layer with the
  // same lifecycle.
  const onAfterRender = () => drawGapMarkers(canvas, markers, guidelines.color);
  const onMouseUp = () => {
    markers = [];
  };

  canvas.on("object:moving", onMoving);
  canvas.on("after:render", onAfterRender);
  canvas.on("mouse:up", onMouseUp);

  return {
    setCardBackground: (color: string) => {
      guidelines.color = pickGuideColor(color);
    },
    dispose: () => {
      window.removeEventListener("keydown", onKeyChange);
      window.removeEventListener("keyup", onKeyChange);
      window.removeEventListener("blur", onBlur);
      canvas.off("object:moving", onMoving);
      canvas.off("after:render", onAfterRender);
      canvas.off("mouse:up", onMouseUp);
      guidelines.dispose();
    },
  };
}

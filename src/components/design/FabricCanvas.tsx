"use client";

import { createElement, forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as fabric from "fabric";
import { DesignDecorationOption, DesignIconOption } from "@/lib/design-icons";

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

export type FabricCanvasHandle = {
  addText: () => void;
  addImage: (dataUrl: string) => Promise<void>;
  addIcon: (icon: DesignIconOption, color: string) => void;
  addDecoration: (decoration: DesignDecorationOption, color: string) => void;
  deleteSelected: () => void;
  bringSelectedToFront: () => void;
  sendSelectedToBack: () => void;
  recolorSelected: (color: string) => void;
  getJSON: () => Record<string, unknown>;
  hasSelection: () => boolean;
  /** Layers panel support -- topmost (front) object first, matching how a layers list is normally read. */
  getLayers: () => CanvasLayerSummary[];
  selectLayer: (layerId: string) => void;
  moveLayer: (layerId: string, toFrontIndex: number) => void;
  deleteLayer: (layerId: string) => void;
};

type FabricCanvasProps = {
  canvasWidth: number;
  canvasHeight: number;
  initialJSON: Record<string, unknown> | null;
  backgroundColor: string;
  readOnly?: boolean;
  className?: string;
  onSelectionChange?: (hasSelection: boolean) => void;
  onChange?: () => void;
};

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
type LayerMeta = { layerId: string; kind: CanvasLayerKind; label: string };

function stampLayerMeta(obj: fabric.FabricObject, meta: LayerMeta) {
  obj.set(meta as unknown as Record<string, unknown>);
}

function readLayerMeta(obj: fabric.FabricObject): LayerMeta {
  const anyObj = obj as unknown as Partial<LayerMeta>;
  return {
    layerId: anyObj.layerId ?? nextLayerId(),
    kind: anyObj.kind ?? "other",
    label: anyObj.label ?? "Element",
  };
}

// Icons/decorations only expose corner controls -- dragging a corner always
// scales both axes together in Fabric, so this is what prevents "someone
// drags the side handle and the icon looks squashed." Images/text keep every
// control (free non-uniform resize is a reasonable thing to want on a photo).
function lockAspectRatio(obj: fabric.FabricObject) {
  obj.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false });
}

export const FabricCanvas = forwardRef<FabricCanvasHandle, FabricCanvasProps>(
  function FabricCanvas(
    {
      canvasWidth,
      canvasHeight,
      initialJSON,
      backgroundColor,
      readOnly = false,
      className,
      onSelectionChange,
      onChange,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasElRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<fabric.Canvas | null>(null);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

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

      if (initialJSON) {
        canvas.loadFromJSON(initialJSON).then((loaded) => {
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
          // Let the parent's layers panel populate with whatever was just
          // loaded -- without this, a freshly opened editor shows an empty
          // layers list until the sender makes their first edit.
          if (!readOnly) onChange?.();
        });
      }

      if (!readOnly) {
        const notifySelection = () => onSelectionChange?.(!!canvas.getActiveObject());
        canvas.on("selection:created", notifySelection);
        canvas.on("selection:updated", notifySelection);
        canvas.on("selection:cleared", notifySelection);
        canvas.on("object:modified", () => onChange?.());
        canvas.on("text:changed", () => onChange?.());

        const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key !== "Delete" && e.key !== "Backspace") return;
          const active = canvas.getActiveObject();
          if (!active) return;
          const target = e.target as HTMLElement | null;
          if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
          if (active instanceof fabric.IText && active.isEditing) return;
          canvas.remove(active);
          canvas.discardActiveObject();
          canvas.requestRenderAll();
          onChange?.();
        };
        window.addEventListener("keydown", handleKeyDown);

        return () => {
          window.removeEventListener("keydown", handleKeyDown);
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
      const zoom = Math.min(containerSize.width / canvasWidth, containerSize.height / canvasHeight);
      canvas.setDimensions({ width: canvasWidth * zoom, height: canvasHeight * zoom });
      canvas.setZoom(zoom);
      canvas.requestRenderAll();
    }, [containerSize, canvasWidth, canvasHeight]);

    // Keep the canvas's own background in sync with palette changes made
    // after the initial mount (e.g. switching palettes in the Style tab).
    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      canvas.backgroundColor = backgroundColor;
      canvas.requestRenderAll();
    }, [backgroundColor]);

    useImperativeHandle(ref, () => ({
      addText: () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const text = new fabric.IText("Edit this text", {
          left: canvasWidth / 2,
          top: canvasHeight / 2,
          originX: "center",
          originY: "center",
          fontSize: 48,
          fill: "#000000",
        });
        stampLayerMeta(text, { layerId: nextLayerId(), kind: "text", label: "Text" });
        canvas.add(text);
        canvas.setActiveObject(text);
        canvas.requestRenderAll();
        onChange?.();
      },
      addImage: async (dataUrl: string) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const img = await fabric.FabricImage.fromURL(dataUrl);
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
        stampLayerMeta(img, { layerId: nextLayerId(), kind: "image", label: "Image" });
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
          stampLayerMeta(group, { layerId: nextLayerId(), kind: "icon", label: icon.name });
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
        stampLayerMeta(path, { layerId: nextLayerId(), kind: "decoration", label: decoration.name });
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
          active.set({ fill: color });
        } else if (active instanceof fabric.Group) {
          active.forEachObject((obj) => obj.set({ stroke: color, fill: obj.fill ? color : obj.fill }));
        } else {
          active.set({ fill: color });
        }
        canvas.requestRenderAll();
        onChange?.();
      },
      getJSON: () => {
        const canvas = fabricRef.current;
        // toObject (not toJSON) so the layerId/kind/label stamped on each
        // object round-trips -- Fabric strips any non-standard property from
        // plain toJSON() unless explicitly told to keep it.
        return canvas ? (canvas.toObject(["layerId", "kind", "label"]) as Record<string, unknown>) : { objects: [] };
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

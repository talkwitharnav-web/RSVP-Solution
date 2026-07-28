"use client";

import { useEffect, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import { getDesignTemplate } from "@/lib/design-templates";
import { getDesignPalette } from "@/lib/design-palettes";
import { getDesignFontPair } from "@/lib/design-fonts";
import { getDesignIcon } from "@/lib/design-icons";
import { slotBox, SlotContent, type DesignedCardFields } from "./DesignedCardContent";
import type { DesignConfig, SlotOffset } from "@/lib/design-types";

/**
 * The editable counterpart to DesignedCardContent -- same slot layout, same
 * palette/font rendering, but each slot is wrapped in an `Rnd` (react-rnd)
 * instance so the sender can drag/resize it within the template's safeArea.
 * Deliberately narrow: no rotate, no add/remove slots, no free z-index
 * layering -- just bounded move + resize on the template's own fixed slots,
 * per the "template-constrained canvas" decision in
 * "custom rsvp card designer.md" section 7.
 *
 * Percent-based slot coordinates are converted to/from pixels here (react-
 * rnd itself works in pixels) using the container's own measured size, so
 * the stored design_config stays resolution-independent -- the same
 * percentages render correctly in this editor, on the guest page, and at
 * any future card size, without re-deriving anything.
 */
export function SlotEditor({
  config,
  fields,
  onSlotChange,
}: {
  config: DesignConfig;
  fields: DesignedCardFields;
  onSlotChange: (slotId: string, offset: SlotOffset) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  // The container's own measured pixel size, kept in state (not read
  // directly off the ref during render -- that's a real React rule
  // violation: refs are only safe to read in effects/handlers, not render)
  // via a ResizeObserver, since react-rnd itself works in pixels but the
  // stored design_config is percent-based for resolution independence.
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const template = getDesignTemplate(config.templateId);
  const palette = getDesignPalette(config.paletteId);
  const fontPair = getDesignFontPair(config.fontPairId);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function pixelsToPercent(px: number, dimension: "width" | "height"): number {
    const total = dimension === "width" ? containerSize.width : containerSize.height;
    return total > 0 ? (px / total) * 100 : 0;
  }

  return (
    <div
      ref={containerRef}
      className="relative aspect-[4/5] w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-strong)]"
      style={{ backgroundColor: palette.background }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setSelectedSlot(null);
      }}
    >
      {/* Safe-area guide -- visual only, not a hard clip, so a sender can see
          where the template intends slots to stay without the app silently
          discarding an edit that drifts slightly outside it. */}
      <div
        className="pointer-events-none absolute rounded-[var(--radius-sm)] border border-dashed"
        style={{
          left: `${template.safeArea.x}%`,
          top: `${template.safeArea.y}%`,
          width: `${template.safeArea.w}%`,
          height: `${template.safeArea.h}%`,
          borderColor: palette.accent,
          opacity: 0.35,
        }}
      />

      {Object.keys(template.slots).map((slotId) => {
        const def = template.slots[slotId];
        const box = slotBox(config.templateId, slotId, config);
        if (!box) return null;
        const isSelected = selectedSlot === slotId;
        const icon = def.kind === "icon" ? getDesignIcon(config.iconId) : null;
        if (def.kind === "icon" && !icon) return null; // nothing to show/drag if no icon was picked

        return (
          <Rnd
            key={slotId}
            bounds="parent"
            size={{ width: `${box.w}%`, height: `${box.h}%` }}
            position={{
              x: (box.x / 100) * containerSize.width,
              y: (box.y / 100) * containerSize.height,
            }}
            onDragStart={() => setSelectedSlot(slotId)}
            onDragStop={(_e, data) => {
              onSlotChange(slotId, {
                x: pixelsToPercent(data.x, "width") - def.x,
                y: pixelsToPercent(data.y, "height") - def.y,
                scale: box.w / def.w,
              });
            }}
            onResizeStop={(_e, _dir, ref, _delta, position) => {
              const newWPercent = pixelsToPercent(ref.offsetWidth, "width");
              onSlotChange(slotId, {
                x: pixelsToPercent(position.x, "width") - def.x,
                y: pixelsToPercent(position.y, "height") - def.y,
                scale: newWPercent / def.w,
              });
            }}
            lockAspectRatio
            className={`flex items-center justify-center ${
              isSelected ? "ring-2 ring-offset-1" : "hover:ring-1"
            }`}
            style={{
              ["--tw-ring-color" as string]: palette.accent,
              cursor: "move",
            }}
            onClick={() => setSelectedSlot(slotId)}
          >
            <div className="pointer-events-none flex h-full w-full items-center justify-center overflow-hidden">
              <SlotContent kind={def.kind} fields={fields} palette={palette} fontPair={fontPair} iconId={config.iconId} />
            </div>
          </Rnd>
        );
      })}
    </div>
  );
}

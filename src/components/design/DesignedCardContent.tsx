import type { CSSProperties } from "react";
import { getDesignTemplate, type SlotKind } from "@/lib/design-templates";
import { getDesignPalette } from "@/lib/design-palettes";
import { getDesignFontPair } from "@/lib/design-fonts";
import { getDesignIcon } from "@/lib/design-icons";
import { resolveSlotOffset, type DesignConfig } from "@/lib/design-types";

export type DesignedCardFields = {
  title: string;
  hostName: string | null;
  description: string | null;
  eventDate: string | null;
  location: string | null;
  cardImageUrl: string | null;
};

/** A slot's resolved percent-based box (x/y/w/h, all 0-100), template default + sender offset. */
export function slotBox(templateId: string, slotId: string, config: DesignConfig | null | undefined) {
  const template = getDesignTemplate(templateId);
  const def = template.slots[slotId];
  if (!def) return null;
  const offset = resolveSlotOffset(config, slotId, def);
  return {
    x: def.x + offset.x,
    y: def.y + offset.y,
    w: def.w * offset.scale,
    h: def.h * offset.scale,
    kind: def.kind,
  };
}

/** Renders one slot's actual content (title text, photo, icon, ...) at whatever size its wrapper gives it -- shared by DesignedCardContent (guest view) and SlotEditor (sender's drag/resize editor) so the two can't visually drift from each other. */
export function SlotContent({
  kind,
  fields,
  palette,
  fontPair,
  iconId,
}: {
  kind: SlotKind;
  fields: DesignedCardFields;
  palette: ReturnType<typeof getDesignPalette>;
  fontPair: ReturnType<typeof getDesignFontPair>;
  iconId: string | null;
}) {
  const displayStyle: CSSProperties = { fontFamily: fontPair.displayVar, color: palette.text };
  const bodyStyle: CSSProperties = { fontFamily: fontPair.bodyVar, color: palette.textMuted };

  switch (kind) {
    case "icon": {
      const icon = getDesignIcon(iconId);
      if (!icon) return null;
      const Icon = icon.Icon;
      return <Icon className="h-full w-full" style={{ color: palette.accent }} strokeWidth={1.5} />;
    }
    case "title":
      return (
        <h1
          className="font-semibold leading-tight"
          style={{ ...displayStyle, fontSize: "clamp(1.1rem, 4cqw, 2.25rem)" }}
        >
          {fields.title || "Your Event Title"}
        </h1>
      );
    case "subtitle":
      return fields.hostName ? (
        <p style={{ ...bodyStyle, fontSize: "clamp(0.75rem, 2cqw, 1rem)" }}>Hosted by {fields.hostName}</p>
      ) : null;
    case "date":
      return fields.eventDate ? (
        <p style={{ ...bodyStyle, fontSize: "clamp(0.75rem, 2cqw, 1rem)" }}>
          {new Date(fields.eventDate).toLocaleString()}
        </p>
      ) : null;
    case "location":
      return fields.location ? (
        <p style={{ ...bodyStyle, fontSize: "clamp(0.75rem, 2cqw, 1rem)" }}>{fields.location}</p>
      ) : null;
    case "description":
      return fields.description ? (
        <p style={{ ...bodyStyle, fontSize: "clamp(0.7rem, 1.8cqw, 0.95rem)" }}>{fields.description}</p>
      ) : null;
    case "photo":
      return fields.cardImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-uploaded data URL, not an optimizable static asset
        <img
          src={fields.cardImageUrl}
          alt=""
          className="h-full w-full rounded-[var(--radius-sm)] object-cover"
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-[var(--radius-sm)] border border-dashed text-xs"
          style={{ borderColor: palette.accent, color: palette.textMuted }}
        >
          Photo
        </div>
      );
    default:
      return null;
  }
}

/**
 * Renders one template's slots at their resolved positions -- pure display,
 * no drag/resize affordances. Used directly by the guest-facing view, and
 * wrapped by SlotEditor (adding react-rnd handles per slot) in the sender's
 * editing flow, so the two can never visually drift from each other.
 *
 * `containerClassName`/style should establish a positioned (relative) box
 * with a real aspect ratio -- slot positions are percentages of this box.
 */
export function DesignedCardContent({
  config,
  fields,
  containerClassName = "",
}: {
  config: DesignConfig;
  fields: DesignedCardFields;
  containerClassName?: string;
}) {
  const template = getDesignTemplate(config.templateId);
  const palette = getDesignPalette(config.paletteId);
  const fontPair = getDesignFontPair(config.fontPairId);

  return (
    <div
      className={`relative aspect-[4/5] w-full overflow-hidden rounded-[var(--radius-md)] ${containerClassName}`}
      style={{ backgroundColor: palette.background, containerType: "inline-size" }}
    >
      {Object.keys(template.slots).map((slotId) => {
        const box = slotBox(config.templateId, slotId, config);
        if (!box) return null;
        return (
          <div
            key={slotId}
            className="absolute flex items-center justify-center overflow-hidden"
            style={{
              left: `${box.x}%`,
              top: `${box.y}%`,
              width: `${box.w}%`,
              height: `${box.h}%`,
            }}
          >
            <SlotContent kind={box.kind} fields={fields} palette={palette} fontPair={fontPair} iconId={config.iconId} />
          </div>
        );
      })}
    </div>
  );
}

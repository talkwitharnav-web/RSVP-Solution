import {
  PartyPopper,
  Sparkles,
  Flower2,
  MoonStar,
  Heart,
  Cake,
  Wine,
  Snowflake,
  type LucideIcon,
} from "lucide-react";

/**
 * Curated subset of lucide-react icons for the "designed_template" invitation
 * designer's optional accent-icon slot -- see "custom rsvp card designer.md"
 * section 4, which inventoried the full installed lucide-react package.
 * Never emoji, per this project's existing icon rule (SYSTEM_MEMORY.md's
 * "UI and Design Rules"). A fixed list rather than exposing the whole
 * library keeps the picker UI small and every option visibly on-theme.
 */
export type DesignIconOption = {
  id: string;
  name: string;
  Icon: LucideIcon;
};

export const DESIGN_ICONS: DesignIconOption[] = [
  { id: "party-popper", name: "Party Popper", Icon: PartyPopper },
  { id: "sparkles", name: "Sparkles", Icon: Sparkles },
  { id: "flower", name: "Flower", Icon: Flower2 },
  { id: "moon-star", name: "Moon & Star", Icon: MoonStar },
  { id: "heart", name: "Heart", Icon: Heart },
  { id: "cake", name: "Cake", Icon: Cake },
  { id: "wine", name: "Wine", Icon: Wine },
  { id: "snowflake", name: "Snowflake", Icon: Snowflake },
];

export function getDesignIcon(id: string | null): DesignIconOption | null {
  if (!id) return null;
  return DESIGN_ICONS.find((i) => i.id === id) ?? null;
}

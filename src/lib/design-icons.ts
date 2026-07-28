import {
  PartyPopper,
  Sparkles,
  Sparkle,
  Flower2,
  Flower,
  MoonStar,
  Moon,
  Heart,
  HeartHandshake,
  Cake,
  CakeSlice,
  Wine,
  Snowflake,
  Gift,
  Trophy,
  Crown,
  Sun,
  Sunrise,
  Leaf,
  LeafyGreen,
  Bell,
  Music,
  Star,
  Stars,
  Balloon,
  TreePalm,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

/**
 * Curated lucide-react icons a sender can add as a movable/recolorable
 * object on the Fabric.js canvas -- see "custom rsvp card designer.md"
 * section 4, which inventoried the full installed lucide-react package.
 * Never emoji, per this project's existing icon rule (SYSTEM_MEMORY.md's
 * "UI and Design Rules"). A fixed list rather than exposing the whole
 * library keeps the picker UI small and every option visibly on-theme.
 *
 * Expanded from 8 to 28 (2026-07-28) so icons can be added as real canvas
 * objects (not a single fixed accent slot) -- see FabricCanvas's addIcon().
 */
export type DesignIconOption = {
  id: string;
  name: string;
  Icon: LucideIcon;
};

export const DESIGN_ICONS: DesignIconOption[] = [
  { id: "party-popper", name: "Party Popper", Icon: PartyPopper },
  { id: "sparkles", name: "Sparkles", Icon: Sparkles },
  { id: "sparkle", name: "Sparkle", Icon: Sparkle },
  { id: "flower", name: "Flower", Icon: Flower2 },
  { id: "flower-simple", name: "Simple Flower", Icon: Flower },
  { id: "moon-star", name: "Moon & Star", Icon: MoonStar },
  { id: "moon", name: "Moon", Icon: Moon },
  { id: "heart", name: "Heart", Icon: Heart },
  { id: "heart-handshake", name: "Heart Handshake", Icon: HeartHandshake },
  { id: "cake", name: "Cake", Icon: Cake },
  { id: "cake-slice", name: "Cake Slice", Icon: CakeSlice },
  { id: "wine", name: "Wine", Icon: Wine },
  { id: "snowflake", name: "Snowflake", Icon: Snowflake },
  { id: "gift", name: "Gift", Icon: Gift },
  { id: "trophy", name: "Trophy", Icon: Trophy },
  { id: "crown", name: "Crown", Icon: Crown },
  { id: "sun", name: "Sun", Icon: Sun },
  { id: "sunrise", name: "Sunrise", Icon: Sunrise },
  { id: "leaf", name: "Leaf", Icon: Leaf },
  { id: "leafy-green", name: "Leafy Green", Icon: LeafyGreen },
  { id: "bell", name: "Bell", Icon: Bell },
  { id: "music", name: "Music", Icon: Music },
  { id: "star", name: "Star", Icon: Star },
  { id: "stars", name: "Stars", Icon: Stars },
  { id: "balloon", name: "Balloon", Icon: Balloon },
  { id: "palm-tree", name: "Palm Tree", Icon: TreePalm },
  { id: "utensils", name: "Utensils", Icon: UtensilsCrossed },
];

export function getDesignIcon(id: string | null): DesignIconOption | null {
  if (!id) return null;
  return DESIGN_ICONS.find((i) => i.id === id) ?? null;
}

/**
 * Small curated set of hand-authored decorative SVG motifs (flourish,
 * confetti burst, sparkle cluster, dotted corner) -- the "personality" layer
 * beyond single-glyph icons, added as their own canvas objects the same way
 * an icon is. Hand-authored rather than sourced from a third-party pack:
 * this project already rejects sender-uploaded SVG for stored-XSS risk (see
 * SYSTEM_MEMORY.md's "Image uploads" section), so an unvetted third-party
 * SVG pack would be the same risk one level removed -- these are simple,
 * fully-reviewed inline path data with no <script>/event-handler surface.
 */
export type DesignDecorationOption = {
  id: string;
  name: string;
  /** Raw SVG path `d` attributes, rendered as a fabric.Path group, fill-colorable. */
  paths: string[];
  viewBox: string;
};

export const DESIGN_DECORATIONS: DesignDecorationOption[] = [
  {
    id: "flourish",
    name: "Flourish",
    viewBox: "0 0 200 40",
    paths: [
      "M0 20 C 40 0, 60 40, 100 20 C 140 0, 160 40, 200 20",
      "M95 14 L100 20 L105 14",
      "M95 26 L100 20 L105 26",
    ],
  },
  {
    id: "confetti-burst",
    name: "Confetti Burst",
    viewBox: "0 0 100 100",
    paths: [
      "M50 10 L54 25 L50 30 L46 25 Z",
      "M85 30 L75 40 L70 37 L78 25 Z",
      "M90 65 L75 68 L73 63 L88 58 Z",
      "M60 90 L52 78 L57 75 L65 86 Z",
      "M20 85 L28 72 L33 75 L27 88 Z",
      "M8 55 L22 50 L24 55 L10 60 Z",
      "M15 20 L27 30 L23 34 L12 25 Z",
    ],
  },
  {
    id: "sparkle-cluster",
    name: "Sparkle Cluster",
    viewBox: "0 0 100 100",
    paths: [
      "M50 5 L58 42 L95 50 L58 58 L50 95 L42 58 L5 50 L42 42 Z",
      "M80 15 L83 25 L93 28 L83 31 L80 41 L77 31 L67 28 L77 25 Z",
      "M18 65 L20.5 73 L28 75.5 L20.5 78 L18 86 L15.5 78 L8 75.5 L15.5 73 Z",
    ],
  },
  {
    id: "dotted-corner",
    name: "Dotted Corner",
    viewBox: "0 0 100 100",
    paths: [
      "M10 10 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0",
      "M30 10 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0",
      "M50 10 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0",
      "M10 30 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0",
      "M10 50 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0",
    ],
  },
];

export function getDesignDecoration(id: string | null): DesignDecorationOption | null {
  if (!id) return null;
  return DESIGN_DECORATIONS.find((d) => d.id === id) ?? null;
}

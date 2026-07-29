/**
 * Curated font-pair presets for the "designed_template" invitation designer.
 * next/font/google resolves/subsets fonts at build time, so these are
 * statically imported once in src/app/layout.tsx (not loaded dynamically per
 * sender choice -- see "custom rsvp card designer.md" section 4 for why that
 * isn't supported) and exposed as CSS variables there. This registry just
 * maps a stable id to the display/body variable pair a template should use.
 *
 * 30 pairs across moods so presets feel genuinely distinct rather than the
 * same handful of parts relabeled (expanded from the original 4, 2026-07-28).
 * `mood` is advisory grouping for the picker UI; `scriptCaution` flags pairs
 * whose display font is dense/decorative enough that using it for more than
 * a short title hurts readability -- advisory only, not enforced.
 */
export type DesignFontMood =
  | "signature"
  | "editorial"
  | "script"
  | "playful"
  | "elegant"
  | "modern"
  | "seasonal";

export type DesignFontPair = {
  id: string;
  name: string;
  mood: DesignFontMood;
  displayVar: string;
  bodyVar: string;
  scriptCaution?: boolean;
};

export const DESIGN_FONT_PAIRS: DesignFontPair[] = [
  {
    id: "signature",
    name: "Signature (this app's own fonts)",
    mood: "signature",
    displayVar: "var(--font-display)",
    bodyVar: "var(--font-body)",
  },
  // Editorial / serif
  {
    id: "editorial",
    name: "Editorial",
    mood: "editorial",
    displayVar: "var(--font-design-editorial-display)",
    bodyVar: "var(--font-design-editorial-body)",
  },
  {
    id: "classic",
    name: "Classic",
    mood: "editorial",
    displayVar: "var(--font-design-classic-display)",
    bodyVar: "var(--font-design-classic-body)",
  },
  {
    id: "garamond-montserrat",
    name: "Garamond & Montserrat",
    mood: "editorial",
    displayVar: "var(--font-design-garamond-display)",
    bodyVar: "var(--font-design-garamond-body)",
  },
  {
    id: "crimson-raleway",
    name: "Crimson & Raleway",
    mood: "editorial",
    displayVar: "var(--font-design-crimson-display)",
    bodyVar: "var(--font-design-crimson-body)",
  },
  {
    id: "libre-source",
    name: "Libre Caslon & Source Sans",
    mood: "editorial",
    displayVar: "var(--font-design-librecaslon-display)",
    bodyVar: "var(--font-design-librecaslon-body)",
  },
  // Script / casual
  {
    id: "playful",
    name: "Playful",
    mood: "script",
    displayVar: "var(--font-design-playful-display)",
    bodyVar: "var(--font-design-playful-body)",
    scriptCaution: true,
  },
  {
    id: "dancing-lato",
    name: "Dancing Script & Lato",
    mood: "script",
    displayVar: "var(--font-design-dancing-display)",
    bodyVar: "var(--font-design-dancing-body)",
    scriptCaution: true,
  },
  {
    id: "allura-jakarta",
    name: "Allura & Plus Jakarta Sans",
    mood: "script",
    displayVar: "var(--font-design-allura-display)",
    bodyVar: "var(--font-design-allura-body)",
    scriptCaution: true,
  },
  {
    id: "alexbrush-nunito",
    name: "Alex Brush & Nunito Sans",
    mood: "script",
    displayVar: "var(--font-design-alexbrush-display)",
    bodyVar: "var(--font-design-alexbrush-body)",
    scriptCaution: true,
  },
  {
    id: "greatvibes-mulish",
    name: "Great Vibes & Mulish",
    mood: "script",
    displayVar: "var(--font-design-greatvibes-display)",
    bodyVar: "var(--font-design-greatvibes-body)",
    scriptCaution: true,
  },
  {
    id: "parisienne-karla",
    name: "Parisienne & Karla",
    mood: "script",
    displayVar: "var(--font-design-parisienne-display)",
    bodyVar: "var(--font-design-parisienne-body)",
    scriptCaution: true,
  },
  // Playful / fun
  {
    id: "pacifico-quicksand",
    name: "Pacifico & Quicksand",
    mood: "playful",
    displayVar: "var(--font-design-pacifico-display)",
    bodyVar: "var(--font-design-pacifico-body)",
    scriptCaution: true,
  },
  {
    id: "baloo-nunito",
    name: "Baloo 2 & Nunito",
    mood: "playful",
    displayVar: "var(--font-design-baloo-display)",
    bodyVar: "var(--font-design-baloo-body)",
  },
  {
    id: "fredoka-comfortaa",
    name: "Fredoka & Comfortaa",
    mood: "playful",
    displayVar: "var(--font-design-fredoka-display)",
    bodyVar: "var(--font-design-fredoka-body)",
  },
  {
    id: "luckiestguy-poppins",
    name: "Luckiest Guy & Poppins",
    mood: "playful",
    displayVar: "var(--font-design-luckiestguy-display)",
    bodyVar: "var(--font-design-luckiestguy-body)",
    scriptCaution: true,
  },
  {
    id: "bungee-worksans",
    name: "Bungee & Work Sans",
    mood: "playful",
    displayVar: "var(--font-design-bungee-display)",
    bodyVar: "var(--font-design-bungee-body)",
    scriptCaution: true,
  },
  // Elegant / formal
  {
    id: "evening",
    name: "Elegant Evening",
    mood: "elegant",
    displayVar: "var(--font-design-evening-display)",
    bodyVar: "var(--font-design-evening-body)",
  },
  {
    id: "cormorant-jost",
    name: "Cormorant Garamond & Jost",
    mood: "elegant",
    displayVar: "var(--font-design-cormorant-display)",
    bodyVar: "var(--font-design-cormorant-body)",
  },
  {
    id: "abril-lora",
    name: "Abril Fatface & Lora",
    mood: "elegant",
    displayVar: "var(--font-design-abril-display)",
    bodyVar: "var(--font-design-abril-body)",
  },
  {
    id: "cinzel-eb",
    name: "Cinzel & EB Garamond",
    mood: "elegant",
    displayVar: "var(--font-design-cinzel-display)",
    bodyVar: "var(--font-design-cinzel-body)",
  },
  {
    id: "marcellus-poppins",
    name: "Marcellus & Poppins",
    mood: "elegant",
    displayVar: "var(--font-design-marcellus-display)",
    bodyVar: "var(--font-design-marcellus-body)",
  },
  {
    id: "prata-mulish",
    name: "Prata & Mulish",
    mood: "elegant",
    displayVar: "var(--font-design-prata-display)",
    bodyVar: "var(--font-design-prata-body)",
  },
  // Modern / clean
  {
    id: "spacegrotesk-ibm",
    name: "Space Grotesk & IBM Plex Sans",
    mood: "modern",
    displayVar: "var(--font-design-spacegrotesk-display)",
    bodyVar: "var(--font-design-spacegrotesk-body)",
  },
  {
    id: "sora-manrope",
    name: "Sora & Manrope",
    mood: "modern",
    displayVar: "var(--font-design-sora-display)",
    bodyVar: "var(--font-design-sora-body)",
  },
  {
    id: "outfit-figtree",
    name: "Outfit & Figtree",
    mood: "modern",
    displayVar: "var(--font-design-outfit-display)",
    bodyVar: "var(--font-design-outfit-body)",
  },
  {
    id: "unbounded-dmsans",
    name: "Unbounded & DM Sans",
    mood: "modern",
    displayVar: "var(--font-design-unbounded-display)",
    bodyVar: "var(--font-design-unbounded-body)",
  },
  // Seasonal / thematic
  {
    id: "amaticsc-worksans",
    name: "Amatic SC & Work Sans",
    mood: "seasonal",
    displayVar: "var(--font-design-amaticsc-display)",
    bodyVar: "var(--font-design-amaticsc-body)",
    scriptCaution: true,
  },
  {
    id: "berkshire-nunito",
    name: "Berkshire Swash & Nunito",
    mood: "seasonal",
    displayVar: "var(--font-design-berkshire-display)",
    bodyVar: "var(--font-design-berkshire-body)",
    scriptCaution: true,
  },
  {
    id: "philosopher-karla",
    name: "Philosopher & Karla",
    mood: "seasonal",
    displayVar: "var(--font-design-philosopher-display)",
    bodyVar: "var(--font-design-philosopher-body)",
  },
];

export function getDesignFontPair(id: string): DesignFontPair {
  return DESIGN_FONT_PAIRS.find((f) => f.id === id) ?? DESIGN_FONT_PAIRS[0];
}

/**
 * Every individual face across the pairs, flattened and deduplicated -- the
 * registry behind per-selection font overrides ("select this bit of text and
 * change only its font"). The pair list stays the card-wide setting; this is
 * the escape hatch for one heading, or one word inside one heading.
 *
 * The id comes from the hand-authored CSS variable name, never from the
 * family name next/font generates, for exactly the reason fontPairId exists:
 * generated names are build artifacts and must not be persisted.
 */
export type DesignFontFamily = {
  id: string;
  name: string;
  cssVar: string;
  /** Which half of its pair this face is, so the picker can group sensibly. */
  role: DesignFontRole;
};

function familyIdFromVar(cssVar: string): string {
  return cssVar
    .trim()
    .replace(/^var\(\s*/, "")
    .replace(/\s*\)$/, "")
    .replace(/^--/, "");
}

/**
 * Most pair names are already "Display & Body", which splits into two real
 * font names. The handful of thematically named pairs ("Editorial",
 * "Playful") have no such split, so their faces are labelled by role rather
 * than inventing a font name that might be wrong.
 */
function splitPairName(pair: DesignFontPair): [string, string] {
  const cleaned = pair.name.replace(/\s*\(.*\)\s*$/, "").trim();
  const parts = cleaned.split("&").map((p) => p.trim());
  if (parts.length === 2 && parts[0] && parts[1]) return [parts[0], parts[1]];
  return [`${cleaned} heading`, `${cleaned} body`];
}

export const DESIGN_FONT_FAMILIES: DesignFontFamily[] = (() => {
  const seen = new Map<string, DesignFontFamily>();
  // Several pairs reuse the same face for their body half (Karla, Mulish,
  // Nunito and Poppins each appear in more than one pair), so the list is
  // deduplicated by name as well as by variable -- otherwise the picker shows
  // the same font several times with no way to tell the entries apart.
  const seenNames = new Set<string>();
  for (const pair of DESIGN_FONT_PAIRS) {
    const [displayName, bodyName] = splitPairName(pair);
    const faces: [string, string, DesignFontRole][] = [
      [pair.displayVar, displayName, "display"],
      [pair.bodyVar, bodyName, "body"],
    ];
    for (const [cssVar, name, role] of faces) {
      const id = familyIdFromVar(cssVar);
      if (seen.has(id) || seenNames.has(name)) continue;
      seen.set(id, { id, name, cssVar, role });
      seenNames.add(name);
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
})();

export function getDesignFontFamily(id: string): DesignFontFamily | undefined {
  return DESIGN_FONT_FAMILIES.find((f) => f.id === id);
}

/** Real, resolved family name for a stable family id -- "" when unknown. */
export function resolveFontFamilyById(id: string): string {
  const family = getDesignFontFamily(id);
  return family ? resolveFontFamily(family.cssVar) : "";
}

/** Which half of a font pair a given canvas text object uses. */
export type DesignFontRole = "display" | "body";

/**
 * A canvas 2D context builds its font from a plain CSS font shorthand string
 * and does NOT resolve custom properties -- handing Fabric
 * "var(--font-design-editorial-display)" as a fontFamily silently falls back
 * to the browser default, which is why every card rendered in Times New
 * Roman regardless of the pair the sender picked. This reads the variable's
 * actual value (next/font generates something like
 * '__Playfair_Display_abc123, __Playfair_Display_Fallback_abc123') off the
 * documentElement, where layout.tsx applies every font class.
 *
 * Client-only: getComputedStyle needs a real DOM.
 */
export function resolveFontFamily(varExpression: string): string {
  if (typeof window === "undefined") return "";
  const name = varExpression.trim().replace(/^var\(\s*/, "").replace(/\s*\)$/, "");
  if (!name.startsWith("--")) return varExpression;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function resolveFontPairFamilies(id: string): Record<DesignFontRole, string> {
  const pair = getDesignFontPair(id);
  return {
    display: resolveFontFamily(pair.displayVar),
    body: resolveFontFamily(pair.bodyVar),
  };
}

/**
 * next/font declares its @font-face blocks up front, but the browser only
 * fetches the file once something actually needs to paint with it -- and a
 * canvas draw doesn't count. Without waiting here, Fabric measures and draws
 * text before the face is available, then never re-renders once it arrives,
 * so the card silently keeps the fallback font. document.fonts.load needs a
 * full shorthand (a size is required, not just a family name).
 */
export async function ensureFontsLoaded(families: string[]): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(
    families
      .filter(Boolean)
      .map((family) => document.fonts.load(`48px ${family}`).catch(() => undefined)),
  );
}

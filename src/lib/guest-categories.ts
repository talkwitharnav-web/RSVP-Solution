import { MAX_GUEST_CATEGORIES, MAX_GUEST_CATEGORY_LENGTH } from "./validation";

export const DEFAULT_GUEST_CATEGORIES = ["Adults", "Kids"];

/**
 * Turns a sender's free-typed "Adults, Kids, Moms, Dads, Pregnant Penguins"
 * into ["Adults", "Kids", "Moms", "Dads", "Pregnant Penguins"] -- split on
 * comma, trim each token, drop anything left empty (double commas, trailing
 * comma). Falls back to the default pair if nothing usable was typed, since
 * an event with zero guest categories has no meaningful breakdown to show.
 *
 * Bounded on both axes: every category becomes a number input on the public
 * RSVP form and a key in every stored category_counts object, so an
 * unbounded list (or a single multi-kilobyte label) submitted straight to
 * the API would bloat both the event row and every RSVP row under it.
 * Duplicates are dropped too -- two identical categories would render as two
 * inputs writing to the same key, so the second silently overwrote the first.
 */
export function parseGuestCategories(raw: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const token of raw.split(",")) {
    const trimmed = token.trim().slice(0, MAX_GUEST_CATEGORY_LENGTH);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push(trimmed);
    if (tokens.length >= MAX_GUEST_CATEGORIES) break;
  }
  return tokens.length > 0 ? tokens : DEFAULT_GUEST_CATEGORIES;
}

export function formatGuestCategories(categories: string[]): string {
  return categories.join(", ");
}

// Reversing English pluralisation can't be done perfectly, so this only
// handles the handful of shapes a guest category realistically takes
// ("Kids", "Children", "Babies", "Plus Ones") and leaves anything it isn't
// confident about alone -- a label shown unchanged is a much smaller
// blemish than one mangled into a non-word.
const IRREGULAR_SINGULARS: Record<string, string> = {
  children: "child",
  people: "person",
  men: "man",
  women: "woman",
};

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

/** Applies the source word's capitalisation to a computed singular. */
function matchCase(source: string, singular: string): string {
  if (source === source.toUpperCase()) return singular.toUpperCase();
  if (source[0] === source[0].toUpperCase()) return singular[0].toUpperCase() + singular.slice(1);
  return singular;
}

function singularizeWord(word: string): string {
  const lower = word.toLowerCase();
  const irregular = IRREGULAR_SINGULARS[lower];
  if (irregular) return matchCase(word, irregular);
  if (!lower.endsWith("s")) return word;

  // Glasses -> Glass, Boxes -> Box, Coaches -> Coach, Dishes -> Dish.
  // Deliberately not plain "-ses": that would turn Horses into "Hors".
  if (/(sses|xes|zes|ches|shes)$/.test(lower)) return word.slice(0, -2);
  // Already singular: Glass, Bus, Chris, Countess.
  if (/(ss|us|is)$/.test(lower)) return word;
  // Babies -> Baby, but Ties -> Tie (too short for the -y form).
  if (lower.endsWith("ies") && lower.length > 4 && !VOWELS.has(lower[lower.length - 4])) {
    return word.slice(0, -3) + matchCase(word.slice(-3), "y");
  }
  return word.slice(0, -1);
}

/**
 * "1 Kids" reads as a typo, so a count of exactly one uses the singular
 * label. Categories are free-typed by the sender, so only the last word is
 * touched -- "Pregnant Penguins" becomes "Pregnant Penguin", not
 * "Pregnant Penguin" via some guess at the whole phrase.
 */
export function categoryLabelForCount(category: string, count: number): string {
  if (count === 1) return singularizeCategory(category);
  return category;
}

function singularizeCategory(category: string): string {
  const words = category.trim().split(/\s+/);
  if (words.length === 0 || words[0] === "") return category;
  const last = words[words.length - 1];
  const singular = singularizeWord(last);
  if (singular === last) return category;
  words[words.length - 1] = singular;
  return words.join(" ");
}

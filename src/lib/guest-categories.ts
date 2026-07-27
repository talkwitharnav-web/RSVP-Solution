export const DEFAULT_GUEST_CATEGORIES = ["Adults", "Kids"];

/**
 * Turns a sender's free-typed "Adults, Kids, Moms, Dads, Pregnant Penguins"
 * into ["Adults", "Kids", "Moms", "Dads", "Pregnant Penguins"] -- split on
 * comma, trim each token, drop anything left empty (double commas, trailing
 * comma). Falls back to the default pair if nothing usable was typed, since
 * an event with zero guest categories has no meaningful breakdown to show.
 */
export function parseGuestCategories(raw: string): string[] {
  const tokens = raw
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  return tokens.length > 0 ? tokens : DEFAULT_GUEST_CATEGORIES;
}

export function formatGuestCategories(categories: string[]): string {
  return categories.join(", ");
}

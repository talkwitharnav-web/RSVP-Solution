"use client";

import { DESIGN_FONT_PAIRS, DesignFontMood, DesignFontPair } from "@/lib/design-fonts";

const MOOD_LABELS: Record<DesignFontMood, string> = {
  signature: "Signature",
  editorial: "Editorial",
  script: "Script & Casual",
  playful: "Playful",
  elegant: "Elegant",
  modern: "Modern",
  seasonal: "Seasonal",
};

const MOOD_ORDER: DesignFontMood[] = [
  "signature",
  "editorial",
  "script",
  "playful",
  "elegant",
  "modern",
  "seasonal",
];

/**
 * Self-contained scrollable font picker -- its own fixed-height, internally
 * scrolling panel (not a plain list that pushes the rest of the sidebar
 * taller), sized off the viewport via dvh so it adapts to actual screen
 * size rather than an arbitrary fixed pixel height. Each row is a small live
 * preview "card" whose own font size scales with the row's width (container
 * query units, same cqw pattern this project already uses for the live
 * card render), not a fixed px size that would look identical whether the
 * sidebar is narrow or wide.
 */
export function FontPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (fontPairId: string) => void;
}) {
  const groups = new Map<DesignFontMood, DesignFontPair[]>();
  for (const pair of DESIGN_FONT_PAIRS) {
    const list = groups.get(pair.mood) ?? [];
    list.push(pair);
    groups.set(pair.mood, list);
  }

  return (
    <div
      className="space-y-4 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] p-3"
      style={{ maxHeight: "min(28rem, 45dvh)", containerType: "inline-size" }}
    >
      {MOOD_ORDER.filter((mood) => groups.has(mood)).map((mood) => (
        <div key={mood} className="space-y-1.5">
          <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            {MOOD_LABELS[mood]}
          </p>
          {groups.get(mood)!.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onChange(f.id)}
              className={`w-full rounded-[var(--radius-sm)] border-2 px-3 py-2 text-left transition-colors ${
                value === f.id
                  ? "border-[var(--color-accent-coral-text)] bg-[var(--color-surface-2)]"
                  : "border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)]"
              }`}
              style={{ containerType: "inline-size" }}
            >
              <span
                className="block truncate text-[var(--color-text-primary)] font-semibold"
                style={{ fontFamily: f.displayVar, fontSize: "clamp(0.95rem, 8cqw, 1.35rem)" }}
              >
                {f.name}
              </span>
              <span
                className="block truncate text-[var(--color-text-muted)]"
                style={{ fontFamily: f.bodyVar, fontSize: "clamp(0.7rem, 5cqw, 0.85rem)" }}
              >
                Aa Bb Cc — the quick brown fox
              </span>
              {f.scriptCaution && (
                <span className="mt-0.5 block text-[0.65rem] text-[var(--color-text-muted)]">
                  Best for a short title, not long body text
                </span>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

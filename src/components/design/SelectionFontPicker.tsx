"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { DESIGN_FONT_FAMILIES } from "@/lib/design-fonts";

/**
 * Font picker for whatever text is currently selected -- one face at a time,
 * as opposed to the Style tab's `FontPicker`, which sets the card-wide
 * display/body *pair*.
 *
 * The split matches the sidebar's own information architecture: the Elements
 * tab is where selection-specific controls live, Style is where card-wide
 * settings live. It also answers the case the pair picker can't: changing one
 * heading, or a few words inside one heading, without touching anything else.
 *
 * Each row previews itself in its own face. The list is filtered rather than
 * paginated because ~50 faces is too many to scan but far too few to need
 * anything cleverer.
 */
export function SelectionFontPicker({
  activeFamilyId,
  partialSelection,
  onPick,
}: {
  activeFamilyId: string | null;
  /** True when only some characters are highlighted, so the label can say what will change. */
  partialSelection: boolean;
  onPick: (familyId: string) => void;
}) {
  const [query, setQuery] = useState("");

  const families = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DESIGN_FONT_FAMILIES;
    return DESIGN_FONT_FAMILIES.filter((f) => f.name.toLowerCase().includes(q));
  }, [query]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.65rem] font-medium text-[var(--color-text-primary)]">Font</span>
        <span className="text-[0.6rem] text-[var(--color-text-muted)]">
          {partialSelection ? "Highlighted text only" : "Whole text box"}
        </span>
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-text-muted)]"
          strokeWidth={2}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search fonts"
          aria-label="Search fonts"
          className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface-0)] py-1 pl-7 pr-6 text-[0.7rem] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-coral-text)]"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear font search"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <X className="h-3 w-3" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* Sized against the viewport rather than a fixed pixel height, so the
          list stays usable on a short screen -- same approach as FontPicker. */}
      <div className="overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-border)]" style={{ maxHeight: "min(16rem, 32dvh)" }}>
        <FontRow
          label="Card's own font"
          fontFamily={undefined}
          active={activeFamilyId === null}
          // Clicking must not blur Fabric's hidden editing textarea, or the
          // highlighted range collapses before the handler ever runs and the
          // change lands on the whole box instead.
          onPick={() => onPick("")}
        />
        {families.map((family) => (
          <FontRow
            key={family.id}
            label={family.name}
            fontFamily={family.cssVar}
            active={activeFamilyId === family.id}
            onPick={() => onPick(family.id)}
          />
        ))}
        {families.length === 0 && (
          <p className="px-2 py-3 text-center text-[0.65rem] text-[var(--color-text-muted)]">
            No fonts match “{query}”.
          </p>
        )}
      </div>
    </div>
  );
}

function FontRow({
  label,
  fontFamily,
  active,
  onPick,
}: {
  label: string;
  fontFamily: string | undefined;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPick}
      aria-pressed={active}
      className={`flex w-full items-center justify-between gap-2 border-b border-[var(--color-border)] px-2 py-1.5 text-left transition-colors last:border-b-0 ${
        active
          ? "bg-[var(--color-accent-lavender)]/15 text-[var(--color-text-primary)]"
          : "text-[var(--color-text-primary)] hover:bg-[var(--color-surface-0)]"
      }`}
    >
      <span className="truncate text-[0.85rem] leading-tight" style={fontFamily ? { fontFamily } : undefined}>
        {label}
      </span>
      {active && (
        <span className="shrink-0 text-[0.6rem] text-[var(--color-accent-lavender)]">Active</span>
      )}
    </button>
  );
}

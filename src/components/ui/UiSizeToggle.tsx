"use client";

import { useState, useEffect, FC } from "react";

type UiSize = "small" | "medium" | "big";

const SIZES: { value: UiSize; label: string }[] = [
  { value: "small", label: "S" },
  { value: "medium", label: "M" },
  { value: "big", label: "B" },
];

function getAppliedSize(): UiSize {
  const attr = document.documentElement.getAttribute("data-ui-size");
  return attr === "small" || attr === "big" ? attr : "medium";
}

/**
 * Small/Medium/Big text-and-spacing scale, independent of theme/contrast.
 * Persisted via localStorage + a data-attribute on <html>, applied
 * pre-hydration by layout.tsx's inline script.
 */
export const UiSizeToggle: FC<{ className?: string }> = ({ className }) => {
  // Starts null so server and first client render always agree; syncs to
  // the real applied size after mount, since reading document.* during the
  // initial render would diverge from SSR's "no document" state whenever
  // the persisted size isn't "medium".
  const [size, setSize] = useState<UiSize | null>(null);

  useEffect(() => {
    // Syncing to a value the pre-hydration <script> already applied to
    // <html> before React ever ran; there's no purer way to read real
    // DOM/localStorage state on mount without diverging from SSR's "no
    // document" render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSize(getAppliedSize());
  }, []);

  const applySize = (next: UiSize) => {
    setSize(next);
    if (next === "medium") {
      document.documentElement.removeAttribute("data-ui-size");
    } else {
      document.documentElement.setAttribute("data-ui-size", next);
    }
    localStorage.setItem("uiSize", next);
  };

  if (size === null) {
    return <div aria-hidden className={`w-[84px] h-8 ${className ?? ""}`} />;
  }

  return (
    <div role="group" aria-label="Interface size" className={`flex items-center ${className ?? ""}`}>
      {SIZES.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => applySize(value)}
          aria-pressed={size === value}
          aria-label={`${value.charAt(0).toUpperCase() + value.slice(1)} interface size`}
          className={`w-8 h-8 rounded-[var(--radius-sm)] text-xs font-semibold transition-colors ${
            size === value
              ? "bg-[var(--color-accent-sage)] text-[var(--color-on-sage)]"
              : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
};

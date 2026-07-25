"use client";

import { useEffect, useRef, useState, FC } from "react";
import { Accessibility } from "lucide-react";
import { ThemedTooltip } from "@/components/ui/ThemedTooltip";
import {
  getA11yPref,
  setA11yPref,
  getCvdMode,
  setCvdMode,
  type A11yPrefKey,
  type CvdMode,
} from "@/lib/accessibility-prefs";
import { useDropdownReveal } from "@/lib/useDropdownReveal";

const OPTIONS: { key: A11yPrefKey; label: string; description: string }[] = [
  { key: "contrast", label: "High Contrast", description: "Stronger text/border contrast for low vision." },
  { key: "motion", label: "Reduce Motion", description: "Turns off animations and transitions." },
  { key: "focus", label: "Enhanced Focus Outline", description: "A bolder, more visible ring on keyboard focus." },
];

const CVD_OPTIONS: { key: CvdMode; label: string }[] = [
  { key: "off", label: "Off" },
  { key: "deuteranopia", label: "Deuteranopia (red-green)" },
  { key: "protanopia", label: "Protanopia (red-green)" },
  { key: "tritanopia", label: "Tritanopia (blue-yellow)" },
];

/**
 * Single "Accessibility" button that opens a dropdown of independent
 * options (contrast, motion, focus), rather than one icon per option
 * cluttering the toolbar.
 */
export const AccessibilityMenu: FC = () => {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Record<A11yPrefKey, boolean>>({
    contrast: false,
    motion: false,
    focus: false,
  });
  const [cvdMode, setCvdModeState] = useState<CvdMode>("off");
  const containerRef = useRef<HTMLDivElement>(null);
  const { shouldRender: showMenu, animationClass: menuAnimationClass } = useDropdownReveal(open);

  useEffect(() => {
    // Syncing to real DOM/localStorage state on mount (see ThemeToggle for
    // the same pattern and full rationale); no purer alternative avoids
    // the SSR hydration mismatch this guards against.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs({
      contrast: getA11yPref("contrast"),
      motion: getA11yPref("motion"),
      focus: getA11yPref("focus"),
    });
    setCvdModeState(getCvdMode());
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggle = (key: A11yPrefKey) => {
    const next = !prefs[key];
    setA11yPref(key, next);
    setPrefs((p) => ({ ...p, [key]: next }));
  };

  const chooseCvdMode = (mode: CvdMode) => {
    setCvdMode(mode);
    setCvdModeState(mode);
  };

  return (
    <div ref={containerRef} className="relative">
      <ThemedTooltip label="Accessibility" disabled={open}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Accessibility options"
          aria-expanded={open}
          aria-haspopup="true"
          className={`w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] transition-colors ${
            open
              ? "bg-[var(--color-accent-sage)] text-[var(--color-on-sage)]"
              : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          <Accessibility size={16} />
        </button>
      </ThemedTooltip>

      {showMenu && (
        <div
          role="menu"
          aria-label="Accessibility options"
          className={`${menuAnimationClass} absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-1)] shadow-lg z-40`}
        >
          <div className="px-4 py-3 border-b border-[var(--color-border)]">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Accessibility</h3>
          </div>
          <ul className="py-1">
            {OPTIONS.map(({ key, label, description }) => (
              <li key={key}>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={prefs[key]}
                  onClick={() => toggle(key)}
                  className="w-full text-left px-4 py-3 flex items-start justify-between gap-3 hover:bg-[var(--color-surface-2)] transition-colors"
                >
                  <span>
                    <span className="block text-sm font-medium text-[var(--color-text-primary)]">{label}</span>
                    <span className="block text-xs text-[var(--color-text-muted)] mt-0.5">{description}</span>
                  </span>
                  <span
                    className={`shrink-0 mt-0.5 w-9 h-5 rounded-[var(--radius-full)] transition-colors relative ${
                      prefs[key]
                        ? "bg-[var(--color-accent-sage)]"
                        : "bg-[var(--color-surface-2)] border border-[var(--color-border-strong)]"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-[var(--radius-full)] shadow transition-transform ${
                        prefs[key] ? "translate-x-[18px] bg-[var(--color-on-sage)]" : "translate-x-0.5 bg-white"
                      }`}
                    />
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="px-4 py-3 border-t border-[var(--color-border)]">
            <h4 className="text-sm font-medium text-[var(--color-text-primary)]">Colorblind-Friendly Palette</h4>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 mb-2">
              Pick the option that matches your color vision.
            </p>
            <div role="radiogroup" aria-label="Colorblind-friendly palette" className="flex flex-col gap-1">
              {CVD_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={cvdMode === key}
                  onClick={() => chooseCvdMode(key)}
                  className={`w-full text-left px-2.5 py-2 rounded-[var(--radius-sm)] text-sm flex items-center gap-2 transition-colors ${
                    cvdMode === key
                      ? "bg-[var(--color-accent-lavender)] text-[var(--color-on-lavender)]"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]"
                  }`}
                >
                  <span
                    className={`shrink-0 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                      cvdMode === key ? "border-[var(--color-on-lavender)]" : "border-[var(--color-border-strong)]"
                    }`}
                  >
                    {cvdMode === key && <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-on-lavender)]" />}
                  </span>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

"use client";

import { useState, useEffect, FC } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "light" | "dark";

function getAppliedTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export const ThemeToggle: FC<{ className?: string }> = ({ className }) => {
  // Starts null so server and first client render always agree; syncs to
  // the theme the pre-hydration script already applied to <html>.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    // Syncing to a value the pre-hydration <script> already applied to
    // <html> before React ever ran; there's no purer way to read real
    // DOM/localStorage state on mount without diverging from SSR's "no
    // document" render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(getAppliedTheme());
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  };

  if (theme === null) {
    return <button aria-hidden className={`w-8 h-8 ${className ?? ""}`} />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={`w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] transition-colors ${className ?? ""}`}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
};

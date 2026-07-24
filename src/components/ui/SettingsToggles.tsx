"use client";

import { CSSProperties, FC, ReactNode, useLayoutEffect, useRef, useState } from "react";
import { ChevronRight, Settings } from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { AccessibilityMenu } from "@/components/ui/AccessibilityMenu";
import { UiSizeToggle } from "@/components/ui/UiSizeToggle";
import { ThemedTooltip } from "@/components/ui/ThemedTooltip";
import { useReservedTopRight } from "@/lib/useReservedTopRight";

const UNRAVEL_DURATION_MS = 450;

function reduceMotionIsActive(): boolean {
  if (document.documentElement.getAttribute("data-motion") === "reduced") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * One unified top-right toolbar for display-preference controls (UI size,
 * accessibility, theme) plus an optional health slot. Collapses to a single
 * Settings icon button; clicking unravels it leftward to reveal the full
 * control row, using a measured width (ResizeObserver) rather than a fixed
 * guess so it stays correct as controls are added/removed.
 */
export const SettingsToggles: FC<{
  className?: string;
  health?: ReactNode;
}> = ({ className, health }) => {
  const reservedAreaRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [expandedWidth, setExpandedWidth] = useState(0);
  const [revealSettled, setRevealSettled] = useState(false);
  useReservedTopRight(reservedAreaRef);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const measure = () => {
      setExpandedWidth(
        Math.max(Math.ceil(content.scrollWidth), Math.ceil(content.getBoundingClientRect().height)),
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, []);

  // Collapsed width is a fixed 2.5rem (40px) square matching the toggle
  // button itself -- leaving width unset let the pill's own 1px border
  // collapse toward near-zero width, where the left and right border edges
  // sit close enough together to read as a single stray vertical line.
  const pillStyle: CSSProperties = {
    width: expanded && expandedWidth > 0 ? `${expandedWidth}px` : "2.5rem",
  };

  const toggleExpanded = () => {
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);

    const nextExpanded = !expanded;
    setRevealSettled(false);
    setExpanded(nextExpanded);

    if (nextExpanded) {
      const duration = reduceMotionIsActive() ? 0 : UNRAVEL_DURATION_MS;
      revealTimerRef.current = setTimeout(() => setRevealSettled(true), duration);
    }
  };

  const controlsAreInteractive = expanded && revealSettled;

  return (
    <div
      ref={reservedAreaRef}
      className={`fixed top-4 right-4 z-40 flex items-start gap-2 h-10 ${className ?? ""}`}
    >
      <div
        className={`settings-pill relative h-10 border border-[var(--color-border-strong)] bg-[var(--color-surface-1)]`}
        style={pillStyle}
        onTransitionEnd={(event) => {
          if (event.propertyName !== "width") return;
          if (expanded) setRevealSettled(true);
        }}
      >
        <div
          className={`settings-pill-reveal-window absolute inset-0 ${
            expanded && revealSettled ? "overflow-visible" : "overflow-hidden"
          }`}
        >
          <div
            ref={contentRef}
            id="settings-pill-controls"
            className={`settings-pill-content absolute inset-y-0 right-0 flex items-center gap-1 px-1.5 pr-10 h-full w-max ${
              expanded ? "settings-pill-content-expanded" : "settings-pill-content-collapsed"
            }`}
            aria-hidden={!controlsAreInteractive}
            inert={!controlsAreInteractive ? true : undefined}
          >
            {health && (
              <>
                {health}
                <span className="w-px h-5 bg-[var(--color-border)]" aria-hidden="true" />
              </>
            )}
            <ThemedTooltip label="Interface size">
              <UiSizeToggle />
            </ThemedTooltip>
            <span className="w-px h-5 bg-[var(--color-border)]" aria-hidden="true" />
            <AccessibilityMenu />
            <ThemedTooltip label="Toggle theme" align="right">
              <ThemeToggle />
            </ThemedTooltip>
          </div>
        </div>

        <div className="absolute top-1 right-1">
          <button
            type="button"
            onClick={toggleExpanded}
            aria-label={expanded ? "Collapse settings" : "Open settings"}
            aria-expanded={expanded}
            aria-controls="settings-pill-controls"
            className="settings-pill-toggle w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <span key={expanded ? "collapse" : "open"} className="settings-pill-toggle-icon inline-flex">
              {expanded ? (
                <ChevronRight className="w-[1.0625rem] h-[1.0625rem]" />
              ) : (
                <Settings className="w-[1.0625rem] h-[1.0625rem]" />
              )}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

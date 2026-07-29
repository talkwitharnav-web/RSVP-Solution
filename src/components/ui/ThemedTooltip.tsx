"use client";

import { useState, useRef, useCallback, useLayoutEffect, FC, ReactNode } from "react";
import { useDropdownReveal } from "@/lib/useDropdownReveal";

/**
 * A small themed tooltip shown on hover, driven by React state rather than
 * the native `title` attribute -- matches the app's own surface/border/radius
 * tokens instead of the browser's plain OS tooltip box.
 *
 * Two nested elements on purpose. The outer one owns position (fixed, so a
 * trigger inside a scrolling panel can't have its tooltip clipped by that
 * panel's overflow) and the centring translate; the inner one owns the
 * reveal animation. They can't be the same element: `dropdown-reveal-in`
 * animates `transform`, and a CSS animation overrides an inline `transform`,
 * which silently discarded the centring and left every tooltip offset by
 * half its own width.
 */
export const ThemedTooltip: FC<{
  label: string;
  children: ReactNode;
  className?: string;
  align?: "center" | "right";
  disabled?: boolean;
}> = ({ label, children, className, align = "center", disabled = false }) => {
  const [hovering, setHovering] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, triggerTop: 0 });
  // Null on each axis means "use the default placement" -- only set when the
  // box would actually leave the viewport, so the common case never
  // re-renders.
  const [placement, setPlacement] = useState<{ left: number | null; top: number | null }>({
    left: null,
    top: null,
  });
  const measuredRef = useRef(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const { shouldRender, animationClass } = useDropdownReveal(hovering && !disabled);

  const EDGE_GAP = 8;

  const show = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      measuredRef.current = false;
      setPlacement({ left: null, top: null });
      setAnchor({
        x: align === "right" ? rect.right : rect.left + rect.width / 2,
        y: rect.bottom + EDGE_GAP,
        // Kept so the box can be flipped to sit above the trigger instead,
        // which needs the trigger's top edge, not its bottom.
        triggerTop: rect.top,
      });
    }
    setHovering(true);
  }, [align]);

  const hide = useCallback(() => setHovering(false), []);

  // Runs only when the box would actually leave the viewport, so the common
  // case stays a single render with no measurement.
  useLayoutEffect(() => {
    if (!shouldRender || measuredRef.current) return;
    const el = tooltipRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    measuredRef.current = true;

    let left: number | null = null;
    if (rect.left < EDGE_GAP) {
      left = EDGE_GAP;
    } else if (rect.right > window.innerWidth - EDGE_GAP) {
      left = Math.max(EDGE_GAP, window.innerWidth - rect.width - EDGE_GAP);
    }

    // Flip above the trigger rather than being clipped by the bottom edge --
    // this is what the editor's zoom controls hit, sitting a few px off the
    // bottom of the window. Only flips if there's genuinely room up there.
    let top: number | null = null;
    if (rect.bottom > window.innerHeight - EDGE_GAP) {
      const above = anchor.triggerTop - rect.height - EDGE_GAP;
      if (above >= EDGE_GAP) top = above;
    }

    if (left !== null || top !== null) setPlacement({ left, top });
  }, [shouldRender, anchor.triggerTop, label]);

  const outerStyle =
    placement.left !== null
      ? { left: placement.left, transform: "none" }
      : { left: anchor.x, transform: align === "right" ? "translateX(-100%)" : "translateX(-50%)" };

  return (
    <div
      ref={triggerRef}
      className={`relative inline-flex ${className ?? ""}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {shouldRender && (
        <div
          style={{ position: "fixed", top: placement.top ?? anchor.y, ...outerStyle }}
          className="z-50 w-max pointer-events-none"
        >
          <div
            ref={tooltipRef}
            role="tooltip"
            // Wraps rather than running off the screen: tooltips also surface
            // full values that were truncated in the UI (long names,
            // filenames), which can be far longer than a hand-written label.
            className={`${animationClass} max-w-xs break-words px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-1)] text-[var(--color-text-primary)] text-xs font-medium shadow-lg`}
          >
            {label}
          </div>
        </div>
      )}
    </div>
  );
};

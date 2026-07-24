"use client";

import { useState, FC, ReactNode } from "react";
import { useDropdownReveal } from "@/lib/useDropdownReveal";

/**
 * A small themed tooltip shown on hover, driven by React state rather than
 * the native `title` attribute -- matches the app's own surface/border/radius
 * tokens instead of the browser's plain OS tooltip box.
 */
export const ThemedTooltip: FC<{
  label: string;
  children: ReactNode;
  className?: string;
  align?: "center" | "right";
  disabled?: boolean;
}> = ({ label, children, className, align = "center", disabled = false }) => {
  const [hovering, setHovering] = useState(false);
  const { shouldRender, animationClass } = useDropdownReveal(hovering && !disabled);

  const alignmentClasses = align === "right" ? "right-0" : "left-1/2 -translate-x-1/2";

  return (
    <div
      className={`relative inline-flex ${className ?? ""}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
    >
      {children}
      {shouldRender && (
        <div
          role="tooltip"
          className={`${animationClass} absolute ${alignmentClasses} top-full mt-2 z-40 max-w-[calc(100vw-2rem)] whitespace-nowrap px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-1)] text-[var(--color-text-primary)] text-xs font-medium shadow-lg pointer-events-none`}
        >
          {label}
        </div>
      )}
    </div>
  );
};

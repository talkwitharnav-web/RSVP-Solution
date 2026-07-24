"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Measures a fixed top-right element (SettingsToggles) and publishes its
 * real rendered size as CSS variables on <html> (--reserved-top-right-w/-h),
 * so in-flow content that also wants the top-right corner (PageHeader's
 * action row) can reserve clearance for it instead of guessing a fixed
 * padding number. SettingsToggles is `position: fixed`, so nothing in
 * document flow naturally makes room for it; its width also isn't
 * constant (it grows when a new toggle is added), so a hardcoded padding
 * guess would silently go stale.
 */
export function useReservedTopRight(ref: RefObject<HTMLElement | null>) {
  const observerRef = useRef<ResizeObserver | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const publish = () => {
      const rect = el.getBoundingClientRect();
      document.documentElement.style.setProperty("--reserved-top-right-w", `${Math.ceil(rect.width)}px`);
      document.documentElement.style.setProperty("--reserved-top-right-h", `${Math.ceil(rect.height)}px`);
    };

    publish();
    observerRef.current = new ResizeObserver(publish);
    observerRef.current.observe(el);
    window.addEventListener("resize", publish);

    return () => {
      observerRef.current?.disconnect();
      window.removeEventListener("resize", publish);
      document.documentElement.style.removeProperty("--reserved-top-right-w");
      document.documentElement.style.removeProperty("--reserved-top-right-h");
    };
  }, [ref]);
}

"use client";

import { useEffect, useRef, useState } from "react";

// Must match globals.css's .dropdown-reveal-out animation-duration (0.15s) --
// this is what keeps the element mounted long enough to play the closing
// animation before React removes it from the DOM.
const EXIT_ANIMATION_MS = 150;

/**
 * Drives the mount/unmount lifecycle for a hover/click popover so it can
 * play a graceful closing animation instead of vanishing the instant the
 * trigger condition goes false. `open` is the boolean the caller already
 * tracks; this hook returns whether the popover should currently be
 * rendered (`shouldRender`, stays true a beat after `open` goes false) and
 * which animation class to apply.
 */
export function useDropdownReveal(open: boolean) {
  const [shouldRender, setShouldRender] = useState(open);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // This effect subscribes to `open` (an external signal the caller
  // controls) and mirrors it into `shouldRender`, delaying the false
  // transition so a closing animation can play -- exactly the "subscribe
  // for updates from an external system" case React's own effect docs
  // describe as legitimate, not the "derived state" case the lint rule is
  // meant to catch. No purer alternative exists: `shouldRender` needs to
  // lag one timer behind `open`, which requires state that survives across
  // renders and a cleanup-able timer, i.e. an effect.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
      setShouldRender(true);
      return;
    }
    timerRef.current = setTimeout(() => setShouldRender(false), EXIT_ANIMATION_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open]);

  return {
    shouldRender,
    animationClass: open ? "dropdown-reveal" : "dropdown-reveal-out",
  };
}

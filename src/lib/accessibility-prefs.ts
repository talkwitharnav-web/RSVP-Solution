/**
 * Shared get/set helpers for the boolean accessibility toggles (contrast,
 * motion, focus) -- each is an independent on/off preference, persisted via
 * localStorage and mirrored onto a data-attribute on <html>, applied
 * pre-hydration by the inline script in layout.tsx (same mechanism as
 * ThemeToggle/UiSizeToggle). The colorblind palette is a separate
 * multi-value preference (see CvdMode/getCvdMode/setCvdMode below), not a
 * boolean.
 */
export type A11yPrefKey = "contrast" | "motion" | "focus";

const ATTR_NAME: Record<A11yPrefKey, string> = {
  contrast: "data-contrast",
  motion: "data-motion",
  focus: "data-focus",
};

const ON_VALUE: Record<A11yPrefKey, string> = {
  contrast: "high",
  motion: "reduced",
  focus: "enhanced",
};

export function getA11yPref(key: A11yPrefKey): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute(ATTR_NAME[key]) === ON_VALUE[key];
}

export function setA11yPref(key: A11yPrefKey, enabled: boolean): void {
  if (enabled) {
    document.documentElement.setAttribute(ATTR_NAME[key], ON_VALUE[key]);
  } else {
    document.documentElement.removeAttribute(ATTR_NAME[key]);
  }
  localStorage.setItem(key, enabled ? ON_VALUE[key] : "off");
}

/**
 * Colorblind-friendly palette selection -- one of three independently-tuned
 * replacement palettes (see globals.css's [data-cvd="..."] blocks), or
 * "off". Deliberately not a boolean like the other three options: each CVD
 * type fails on a different hue axis, so letting the user pick the one
 * that matches their actual vision is stronger than one compromise palette.
 */
export type CvdMode = "off" | "deuteranopia" | "protanopia" | "tritanopia";

export function getCvdMode(): CvdMode {
  if (typeof document === "undefined") return "off";
  const attr = document.documentElement.getAttribute("data-cvd");
  if (attr === "deuteranopia" || attr === "protanopia" || attr === "tritanopia") return attr;
  return "off";
}

export function setCvdMode(mode: CvdMode): void {
  if (mode === "off") {
    document.documentElement.removeAttribute("data-cvd");
  } else {
    document.documentElement.setAttribute("data-cvd", mode);
  }
  localStorage.setItem("cvd", mode);
}

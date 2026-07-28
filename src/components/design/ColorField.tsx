"use client";

import { ChangeEvent } from "react";
import { Label } from "@/components/ui/Input";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * A single free-form color role (background/text/accent/etc.) -- a native
 * color swatch plus an editable hex field. Replaces the old fixed
 * DESIGN_PALETTES-only picker: a sender can now set every role
 * independently instead of choosing between four preset themes.
 */
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const handleHexInput = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    onChange(next.startsWith("#") ? next : `#${next}`);
  };

  const handleHexBlur = (e: ChangeEvent<HTMLInputElement>) => {
    if (!HEX_RE.test(e.target.value)) onChange(value);
  };

  return (
    <div className="flex items-center gap-2.5">
      <input
        type="color"
        value={HEX_RE.test(value) ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-9 flex-shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-[var(--color-border-strong)]"
        aria-label={label}
      />
      <div className="min-w-0 flex-1">
        <Label className="mb-1">{label}</Label>
        <input
          type="text"
          value={value}
          onChange={handleHexInput}
          onBlur={handleHexBlur}
          spellCheck={false}
          maxLength={7}
          className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface-0)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-coral-text)]"
        />
      </div>
    </div>
  );
}

export function ColorFieldGroup({
  colors,
  onChange,
}: {
  colors: { background: string; text: string; textMuted: string; accent: string; onAccent: string };
  onChange: (colors: { background: string; text: string; textMuted: string; accent: string; onAccent: string }) => void;
}) {
  return (
    <div className="space-y-2.5">
      <ColorField label="Background" value={colors.background} onChange={(v) => onChange({ ...colors, background: v })} />
      <ColorField label="Text" value={colors.text} onChange={(v) => onChange({ ...colors, text: v })} />
      <ColorField label="Muted text" value={colors.textMuted} onChange={(v) => onChange({ ...colors, textMuted: v })} />
      <ColorField label="Accent" value={colors.accent} onChange={(v) => onChange({ ...colors, accent: v })} />
      <ColorField label="Text on accent" value={colors.onAccent} onChange={(v) => onChange({ ...colors, onAccent: v })} />
    </div>
  );
}

"use client";

import { FC } from "react";
import { ShieldAlert, ShieldQuestion, Shield, ShieldCheck, ShieldPlus, Crown } from "lucide-react";
import type { StrengthTier } from "@/lib/credential-strength";

const TIER_META: Record<StrengthTier, { Icon: typeof Shield; barClass: string; textClass: string }> = {
  weak: { Icon: ShieldAlert, barClass: "bg-[var(--color-danger)]", textClass: "text-[var(--color-danger)]" },
  okay: { Icon: ShieldQuestion, barClass: "bg-orange-400", textClass: "text-orange-500" },
  good: { Icon: Shield, barClass: "bg-yellow-500", textClass: "text-yellow-600" },
  strong: { Icon: ShieldCheck, barClass: "bg-lime-500", textClass: "text-lime-600" },
  amazing: { Icon: ShieldPlus, barClass: "bg-[var(--color-success)]", textClass: "text-[var(--color-success)]" },
  "s-tier": { Icon: Crown, barClass: "bg-[var(--color-accent-coral)]", textClass: "text-[var(--color-accent-coral-text)]" },
};

const MAX_BARS = 6;

export const StrengthMeter: FC<{
  tier: StrengthTier;
  label: string;
  bars: number;
  empty?: boolean;
}> = ({ tier, label, bars, empty = false }) => {
  if (empty) return null;

  const { Icon, barClass, textClass } = TIER_META[tier];

  return (
    <div className="mt-1.5" aria-live="polite">
      <div className="flex gap-1 mb-1">
        {Array.from({ length: MAX_BARS }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < bars ? barClass : "bg-[var(--color-surface-2)]"
            }`}
          />
        ))}
      </div>
      <p className={`flex items-center gap-1.5 text-xs font-medium ${textClass}`}>
        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
        {label}
      </p>
    </div>
  );
};

export type StrengthTier = "weak" | "okay" | "good" | "strong" | "amazing" | "s-tier";

export const STRENGTH_TIERS: { tier: StrengthTier; label: string; bars: number }[] = [
  { tier: "weak", label: "Weak", bars: 1 },
  { tier: "okay", label: "Okay", bars: 2 },
  { tier: "good", label: "Good", bars: 3 },
  { tier: "strong", label: "Strong", bars: 4 },
  { tier: "amazing", label: "Amazing", bars: 5 },
  { tier: "s-tier", label: "S-Tier", bars: 6 },
];

function tierFromScore(score: number, maxScore: number): StrengthTier {
  const ratio = maxScore > 0 ? score / maxScore : 0;
  if (ratio >= 1) return "s-tier";
  if (ratio >= 0.83) return "amazing";
  if (ratio >= 0.66) return "strong";
  if (ratio >= 0.45) return "good";
  if (ratio >= 0.22) return "okay";
  return "weak";
}

const COMMON_PASSWORDS = new Set([
  "password", "12345678", "123456789", "qwerty123", "letmein", "welcome",
  "password1", "admin123", "iloveyou", "rsvp1234",
]);

export function scorePasswordStrength(password: string): { tier: StrengthTier; label: string; bars: number } {
  if (password.length === 0) {
    return { tier: "weak", label: "Weak", bars: 0 };
  }

  let score = 0;

  score += Math.min(password.length / 4, 5);

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);
  const varietyCount = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  score += varietyCount * 1.2;

  const uniqueChars = new Set(password.toLowerCase()).size;
  if (uniqueChars <= 3 && password.length >= 6) score -= 3;

  if (COMMON_PASSWORDS.has(password.toLowerCase())) score = 0;

  const maxScore = 5 + 4 * 1.2;
  const tier = tierFromScore(Math.max(score, 0), maxScore);
  const meta = STRENGTH_TIERS.find((t) => t.tier === tier)!;
  return { tier, label: meta.label, bars: meta.bars };
}

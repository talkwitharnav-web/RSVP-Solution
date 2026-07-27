"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { RsvpQuestion } from "@/lib/types";

/**
 * Themed Yes/No attendance toggle -- replaces the previous plain radio dots,
 * which carried no theme identity and read as barebones. Two large buttons
 * (not a native radio group) so the selected state can wear real theme
 * color instead of the browser's default radio dot.
 */
function AttendanceToggle({ attending, onChange }: { attending: boolean; onChange: (value: boolean) => void }) {
  return (
    <div role="radiogroup" aria-label="Will you attend?" className="grid grid-cols-2 gap-3">
      <button
        type="button"
        role="radio"
        aria-checked={attending}
        onClick={() => onChange(true)}
        className={`flex items-center justify-center gap-2 rounded-[var(--radius-sm)] border-2 px-4 py-3.5 text-base font-semibold transition-colors ${
          attending
            ? "border-[var(--color-accent-sage)] bg-[var(--color-accent-sage)]/15 text-[var(--color-accent-sage)]"
            : "border-[var(--color-border-strong)] bg-[var(--color-surface-0)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)]"
        }`}
      >
        <Check className="h-5 w-5" strokeWidth={2.5} />
        Yes, I&apos;ll be there
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={!attending}
        onClick={() => onChange(false)}
        className={`flex items-center justify-center gap-2 rounded-[var(--radius-sm)] border-2 px-4 py-3.5 text-base font-semibold transition-colors ${
          !attending
            ? "border-[var(--color-accent-coral-text)] bg-[var(--color-accent-coral)]/15 text-[var(--color-accent-coral-text)]"
            : "border-[var(--color-border-strong)] bg-[var(--color-surface-0)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)]"
        }`}
      >
        <X className="h-5 w-5" strokeWidth={2.5} />
        Can&apos;t make it
      </button>
    </div>
  );
}

/**
 * Per-category guest count row -- generalizes "adults + kids = N total" to
 * however many categories the host defined (guestCategories). Each category
 * gets its own number input; the total is computed and shown live rather
 * than asked for separately, so it can never drift out of sync with the
 * per-category numbers.
 */
function CategoryCounts({
  categories,
  counts,
  onChange,
}: {
  categories: string[];
  counts: Record<string, number>;
  onChange: (category: string, value: number) => void;
}) {
  const total = categories.reduce((sum, c) => sum + (counts[c] ?? 0), 0);

  return (
    <div>
      <Label>Who&apos;s coming?</Label>
      <div className="flex flex-wrap items-end gap-2">
        {categories.map((category, i) => (
          <div key={category} className="flex items-end gap-2">
            {i > 0 && <span className="pb-3 text-lg font-semibold text-[var(--color-text-muted)]">+</span>}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-[var(--color-text-muted)]">{category}</span>
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={counts[category] ?? 0}
                onChange={(e) => onChange(category, Math.max(0, Math.trunc(Number(e.target.value)) || 0))}
                className="w-20 text-center"
              />
            </div>
          </div>
        ))}
        <span className="pb-3 text-lg font-semibold text-[var(--color-text-muted)]">=</span>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-[var(--color-text-muted)]">Total</span>
          <div className="flex h-[3.125rem] w-20 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] text-base font-semibold text-[var(--color-text-primary)]">
            {total}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RsvpForm({
  slug,
  questions,
  guestCategories,
}: {
  slug: string;
  questions: RsvpQuestion[];
  guestCategories: string[];
}) {
  const [guestName, setGuestName] = useState("");
  const [attending, setAttending] = useState(true);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    guestCategories.forEach((c, i) => {
      initial[c] = i === 0 ? 1 : 0;
    });
    return initial;
  });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/events/${slug}/rsvps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestName, attending, categoryCounts, answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <Card className="text-center">
        <p className="text-lg text-[var(--color-text-primary)]">
          Thanks, <span className="font-semibold">{guestName}</span>! Your RSVP has been recorded.
        </p>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 sm:gap-6">
      <div>
        <Label htmlFor="guestName">Your name</Label>
        <Input id="guestName" value={guestName} onChange={(e) => setGuestName(e.target.value)} required />
      </div>

      <AttendanceToggle attending={attending} onChange={setAttending} />

      {attending && (
        <CategoryCounts
          categories={guestCategories}
          counts={categoryCounts}
          onChange={(category, value) => setCategoryCounts((c) => ({ ...c, [category]: value }))}
        />
      )}

      {questions.map((q) => (
        <div key={q.id}>
          <Label htmlFor={q.id}>{q.label}</Label>
          {q.type === "boolean" ? (
            <select
              id={q.id}
              className="w-full px-4 py-3 text-base bg-[var(--color-surface-0)] text-[var(--color-text-primary)] border border-[var(--color-border-strong)] rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-coral-text)] focus:border-[var(--color-accent-coral-text)] transition-colors"
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              required={q.required}
            >
              <option value="" disabled>
                Select…
              </option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          ) : (
            <Input
              id={q.id}
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              required={q.required}
            />
          )}
        </div>
      ))}

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      <Button type="submit" size="lg" disabled={submitting} className="w-full">
        {submitting ? "Submitting…" : "Submit RSVP"}
      </Button>
    </form>
  );
}

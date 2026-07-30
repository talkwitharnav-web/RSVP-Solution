"use client";

import { useId, useState } from "react";
import { Check, X } from "lucide-react";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useOptimisticActions } from "@/lib/optimistic";
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

// No realistic RSVP party has anywhere near this many people in one
// category -- caps both the absurd-input case (typing 999999999) and keeps
// the total display from ever needing to grow unreasonably wide.
const MAX_CATEGORY_COUNT = 999;

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
  // Each count field needs its own label association -- the category name
  // used to be a plain span, so a screen reader announced two identical
  // unlabelled spin buttons with no way to tell Adults from Kids.
  const fieldIdPrefix = useId();
  const groupLabelId = `${fieldIdPrefix}-group`;

  return (
    <div role="group" aria-labelledby={groupLabelId}>
      {/* A span, not <Label>: it names the whole group via aria-labelledby,
          and a <label> with no control of its own is an orphan. */}
      <span
        id={groupLabelId}
        className="block text-sm font-medium text-[var(--color-text-muted)] mb-2"
      >
        Who&apos;s coming?
      </span>
      <div className="flex flex-wrap items-end gap-2">
        {categories.map((category, i) => (
          <div key={category} className="flex items-end gap-2">
            {i > 0 && <span className="pb-3 text-lg font-semibold text-[var(--color-text-muted)]">+</span>}
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${fieldIdPrefix}-${i}`}
                className="text-xs text-[var(--color-text-muted)]"
              >
                {category}
              </label>
              <Input
                id={`${fieldIdPrefix}-${i}`}
                type="number"
                min={0}
                max={MAX_CATEGORY_COUNT}
                inputMode="numeric"
                // A plain controlled `value={counts[category]}` re-renders the
                // input with the numeric value on every keystroke, which is
                // what caused the "type 1, see 01" bug -- as soon as a digit
                // lands, React reflows the field back to Number(current
                // digits), and a still-empty/zero previous state briefly
                // shows as a leading zero next to the new digit. Rendering
                // the raw string (rather than round-tripping through
                // Number()) lets the field hold intermediate typing states
                // like "" or a single "1" without a phantom zero.
                value={counts[category] === 0 ? "" : String(counts[category] ?? "")}
                placeholder="0"
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, "");
                  if (raw === "") {
                    onChange(category, 0);
                    return;
                  }
                  const clamped = Math.min(MAX_CATEGORY_COUNT, parseInt(raw, 10));
                  onChange(category, clamped);
                }}
                className="w-20 text-center"
              />
            </div>
          </div>
        ))}
        <span className="pb-3 text-lg font-semibold text-[var(--color-text-muted)]">=</span>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-[var(--color-text-muted)]">Total</span>
          <div className="flex h-[3.125rem] min-w-20 w-fit items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-base font-semibold text-[var(--color-text-primary)]">
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
  const [submitted, setSubmitted] = useState(false);
  const attendingGuestCount = guestCategories.reduce(
    (total, category) => total + (categoryCounts[category] ?? 0),
    0,
  );

  // The thank-you appears the moment the guest submits, rather than after a
  // round trip; if the server refuses (event unpublished, rate limited, bad
  // input) the form comes straight back with their answers intact and the
  // real reason shown. See lib/optimistic.ts.
  const { run, hasPending } = useOptimisticActions();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (attending && attendingGuestCount < 1) {
      setError("Please include at least one guest in your RSVP.");
      return;
    }
    void run({
      apply: () => {
        setError(null);
        setSubmitted(true);
        return () => setSubmitted(false);
      },
      commit: async () => {
        const res = await fetch(`/api/events/${slug}/rsvps`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guestName, attending, categoryCounts, answers }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Something went wrong");
        return data;
      },
      errorLabel: "Your RSVP wasn't recorded",
      onRejected: (err) => setError(`Your RSVP wasn't recorded — ${err.message}`),
    });
  }

  if (submitted) {
    return (
      <Card className="text-center">
        <p className="text-lg text-[var(--color-text-primary)]">
          Thanks, <span className="font-semibold">{guestName}</span>! Your RSVP has been recorded.
        </p>
        {hasPending && (
          <p className="mt-2 text-sm text-[var(--color-text-muted)]" role="status">
            Sending it to the host...
          </p>
        )}
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 sm:gap-6">
      <div>
        <Label htmlFor="guestName">Your name</Label>
        <Input
          id="guestName"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          maxLength={120}
          required
        />
      </div>

      <AttendanceToggle
        attending={attending}
        onChange={(value) => {
          setAttending(value);
          setError(null);
        }}
      />

      {attending && (
        <CategoryCounts
          categories={guestCategories}
          counts={categoryCounts}
          onChange={(category, value) => {
            setCategoryCounts((c) => ({ ...c, [category]: value }));
            setError(null);
          }}
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
              maxLength={2000}
              required={q.required}
            />
          )}
        </div>
      ))}

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      <Button type="submit" size="lg" className="w-full">
        Submit RSVP
      </Button>
    </form>
  );
}

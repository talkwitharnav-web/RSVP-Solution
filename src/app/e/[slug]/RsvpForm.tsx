"use client";

import { useState } from "react";
import type { RsvpQuestion } from "@/lib/types";

export default function RsvpForm({
  slug,
  questions,
}: {
  slug: string;
  questions: RsvpQuestion[];
}) {
  const [guestName, setGuestName] = useState("");
  const [attending, setAttending] = useState(true);
  const [guestCount, setGuestCount] = useState(1);
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
        body: JSON.stringify({ guestName, attending, guestCount, answers }),
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
      <p className="rounded-md border border-black/10 px-4 py-3 text-sm dark:border-white/15">
        Thanks, {guestName}! Your RSVP has been recorded.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Your name
        <input
          className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          required
        />
      </label>

      <fieldset className="flex flex-col gap-1 text-sm">
        <legend>Will you attend?</legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={attending}
              onChange={() => setAttending(true)}
            />
            Yes
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={!attending}
              onChange={() => setAttending(false)}
            />
            No
          </label>
        </div>
      </fieldset>

      {attending && (
        <label className="flex flex-col gap-1 text-sm">
          Number of guests
          <input
            type="number"
            min={1}
            className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
            value={guestCount}
            onChange={(e) => setGuestCount(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
      )}

      {questions.map((q) => (
        <label key={q.id} className="flex flex-col gap-1 text-sm">
          {q.label}
          {q.type === "boolean" ? (
            <select
              className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
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
            <input
              className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              required={q.required}
            />
          )}
        </label>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-full bg-black px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        {submitting ? "Submitting…" : "Submit RSVP"}
      </button>
    </form>
  );
}

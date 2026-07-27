"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RsvpQuestion } from "@/lib/types";

let questionIdCounter = 0;
function nextQuestionId() {
  questionIdCounter += 1;
  return `q${questionIdCounter}`;
}

export default function CreateTemplatePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [hostName, setHostName] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [location, setLocation] = useState("");
  const [questions, setQuestions] = useState<RsvpQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function addQuestion() {
    setQuestions((qs) => [
      ...qs,
      { id: nextQuestionId(), label: "", type: "text", required: false },
    ]);
  }

  function updateQuestion(id: string, patch: Partial<RsvpQuestion>) {
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }

  function removeQuestion(id: string) {
    setQuestions((qs) => qs.filter((q) => q.id !== id));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "hosted_template",
          title,
          hostName,
          description,
          eventDate: eventDate || null,
          location,
          questions: questions.filter((q) => q.label.trim()),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      router.push(`/e/${data.slug}?mode=edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Build a template</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Fill in the basics, add any extra questions, and we&apos;ll host the RSVP form for you.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Event title
          <input
            className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Host name (optional)
          <input
            className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
            value={hostName}
            onChange={(e) => setHostName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Description (optional)
          <textarea
            className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Date &amp; time (optional)
          <input
            type="datetime-local"
            className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Location (optional)
          <input
            className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </label>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Extra questions</span>
            <button
              type="button"
              onClick={addQuestion}
              className="text-sm font-medium underline underline-offset-2"
            >
              + Add question
            </button>
          </div>
          {questions.map((q) => (
            <div key={q.id} className="flex items-center gap-2">
              <input
                className="flex-1 rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
                placeholder="Question label"
                value={q.label}
                onChange={(e) => updateQuestion(q.id, { label: e.target.value })}
              />
              <select
                className="rounded-md border border-black/15 px-2 py-2 text-sm dark:border-white/20 dark:bg-transparent"
                value={q.type}
                onChange={(e) =>
                  updateQuestion(q.id, { type: e.target.value as RsvpQuestion["type"] })
                }
              >
                <option value="text">Text</option>
                <option value="boolean">Yes/No</option>
              </select>
              <button
                type="button"
                onClick={() => removeQuestion(q.id)}
                className="text-sm text-red-600"
                aria-label="Remove question"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-black px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {submitting ? "Creating…" : "Create RSVP page"}
        </button>
      </form>
    </main>
  );
}

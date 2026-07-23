"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateLinkPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [hostName, setHostName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "external_link", title, externalUrl, hostName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      router.push(`/e/${data.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Bring your own link</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        We&apos;ll give you a shareable page that hands guests off to your existing RSVP link.
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
          Your RSVP link
          <input
            type="url"
            className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            placeholder="https://..."
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

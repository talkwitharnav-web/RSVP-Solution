import { notFound } from "next/navigation";
import { initDb, pool } from "@/lib/db";
import type { EventRecord } from "@/lib/types";
import RsvpForm from "./RsvpForm";

async function getEvent(slug: string): Promise<EventRecord | null> {
  await initDb();
  const result = await pool.query(`SELECT * FROM events WHERE slug = $1`, [slug]);
  if (result.rows.length === 0) return null;
  return result.rows[0] as EventRecord;
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEvent(slug);
  if (!event) notFound();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{event.title}</h1>
        {event.host_name && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Hosted by {event.host_name}
          </p>
        )}
        {event.description && <p className="text-sm">{event.description}</p>}
        {event.event_date && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {new Date(event.event_date).toLocaleString()}
          </p>
        )}
        {event.location && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{event.location}</p>
        )}
      </div>

      {event.kind === "external_link" ? (
        <a
          href={event.external_url ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-black px-6 py-3 text-center font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          RSVP now
        </a>
      ) : (
        <RsvpForm slug={event.slug} questions={event.questions} />
      )}
    </main>
  );
}

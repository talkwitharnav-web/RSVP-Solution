import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-24 text-center">
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">RSVP</h1>
        <p className="max-w-md text-zinc-600 dark:text-zinc-400">
          Create an RSVP page and share it with a link.
        </p>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row">
        <Link
          href="/create/template"
          className="rounded-full bg-black px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Build a template here
        </Link>
        <Link
          href="/create/link"
          className="rounded-full border border-black/15 px-6 py-3 font-medium transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Bring your own link
        </Link>
      </div>
    </main>
  );
}

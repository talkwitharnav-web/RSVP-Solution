# RSVP

Create an RSVP page and share it via a link. Two flows: bring your own external RSVP link, or build a simple hosted RSVP form on this site.

Built with Next.js, TypeScript, Tailwind CSS, and Postgres (via Docker). See `CLAUDE.md` and `SYSTEM_MEMORY.md` for project details.

## Getting Started

Easiest path — one command brings up Docker Desktop (launching it if needed), Postgres, and the dev server:

```bash
npm run start:all
```

Or double-click `startup.cmd` in the project root.

When you're done, stop everything (including Docker Desktop and WSL):

```bash
npm run stop:all
```

Or double-click `shutdown.cmd`.

Once running, open [http://localhost:3001](http://localhost:3001) — **note the app runs on port 3001, not the Next.js default 3000**, to avoid clashing with other local projects that use 3000.

### Other useful commands

- `npm run dev` — just the Next.js dev server (assumes Postgres is already up)
- `npm run db:up` / `npm run db:down` — just the Postgres container (`db:down` also fully quits Docker Desktop and WSL)
- `npm run lint` — ESLint
- `npx tsc --noEmit` — typecheck

# RSVP

Create an RSVP page and share it via a link. Two flows: bring your own external RSVP link, or build a simple hosted RSVP form on this site.

Built with Next.js, TypeScript, Tailwind CSS, and Postgres (via Docker). See `CLAUDE.md` and `SYSTEM_MEMORY.md` for project details.

## Getting Started

Easiest path — one command brings up Docker Desktop (launching it if needed), Postgres, and the dev server:

```bash
npm run start:all
```

`start:all` always runs **development mode** (`npm run dev`): hot reload,
detailed debugging, LAN sender/receiver testing, and localhost-only admin.

Or double-click `startup.cmd` in the project root.

When you're done, stop everything (including Docker Desktop and WSL):

```bash
npm run stop:all
```

Or double-click `shutdown.cmd`.

Once running, open [http://localhost:3001](http://localhost:3001) — **note the app runs on port 3001, not the Next.js default 3000**, to avoid clashing with other local projects that use 3000.

The startup scripts create `.env.local` from `.env.local.example` when needed
and generate a private `SESSION_SECRET` without printing it. PostgreSQL is
published on `127.0.0.1:5432` only.

## Production

Do not expose `npm run dev` publicly. `npm start` uses the production build and
fails closed unless `SESSION_SECRET` is at least 32 bytes and
`FORCE_SECURE_COOKIES=true`. Production binds to `127.0.0.1` by default and
must sit behind a same-host HTTPS reverse proxy that preserves `Host` and
forwards the client IP. Admin pages/APIs remain available directly from the
server machine and return 404 to remote clients.

Production is the same codebase in optimized mode, not a second app. Build it
first, then start it in an environment where Secure cookies and HTTPS are
configured:

```powershell
$env:FORCE_SECURE_COOKIES="true"
npm run build
npm start
```

For a container that must bind to `0.0.0.0`, set `HOST` explicitly, keep port
3001 private behind the proxy, and set `TRUSTED_PROXY_IPS` to the proxy's direct
socket address. Replace the development PostgreSQL credentials with generated
secrets and a restricted application role before deployment.

### Other useful commands

- `npm run dev` — just the Next.js dev server (assumes Postgres is already up)
- `npm run db:up` / `npm run db:down` — just the Postgres container (`db:down` also fully quits Docker Desktop and WSL)
- `npm run lint` — ESLint
- `npx tsc --noEmit` — typecheck

# RSVP

Create an RSVP invitation and share it through one guest link. Senders can
upload an invitation card or design one in the built-in Fabric.js editor;
guests RSVP through the hosted form and senders see live statistics.

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

Production is the same codebase in optimized mode, not a second app. The
supported deployment target is a Linux Mint server running private Docker
Postgres, the Node app as a systemd service, and Cloudflare Tunnel as the
public HTTPS doorway. The full plain-English guide is
[`deploy/DEPLOYMENT.md`](deploy/DEPLOYMENT.md).

First install on Linux Mint:

```bash
git clone https://github.com/talkwitharnav-web/RSVP-Solution.git
cd RSVP-Solution
sudo bash ./server-setup.sh
```

The installer adds Docker Engine/Compose, Node.js 22/npm, Git, SSH,
`cloudflared`, firewall tools, the production database, generated secrets,
automatic services, and verified nightly backups. It does not install Docker
Desktop because a Linux server only needs Docker Engine.

Before a domain exists, test through a temporary Cloudflare address:

```bash
sudo rsvp preview
```

When the Cloudflare-managed domain is ready:

```bash
sudo rsvp domain rsvp.yourdomain.com
```

Normal server operations then use `sudo rsvp status`, `update`, `restart`,
`logs`, `backup`, and `restore`. Production starts with a fresh database;
development test data should not be copied to it.

### Local TLS-chain test

Cloudflare Tunnel is the real deployment boundary. `scripts/tls-proxy.mjs`
remains a local reference/test implementation for checking the HTTPS and
trusted-proxy chain without Cloudflare.

Local end-to-end test, self-signed cert (a real deployment needs a real
CA-issued certificate — Let's Encrypt or similar — for its real domain;
self-signed only satisfies "TLS exists," not "a browser will trust it"):

```powershell
# 1. Generate a local self-signed cert once (gitignored, never committed)
powershell -ExecutionPolicy Bypass -File scripts/generate-dev-cert.ps1

# 2. Build and start the app in production mode
$env:FORCE_SECURE_COOKIES="true"
$env:TRUSTED_PROXY_IPS="127.0.0.1,::1,::ffff:127.0.0.1"
npm run build
npm start

# 3. In a second terminal, start the TLS proxy in front of it
node scripts/tls-proxy.mjs
```

Then open `https://localhost:8443` (accept the self-signed warning). Direct
requests to `http://localhost:3001` still work per the existing security
design (loopback-bound, no TLS) — that's intentional, not a bypass, since
port 3001 is only reachable from the same machine.

### Standalone production database-role helper

`docker-compose.yml`'s `postgres`/`postgres` credentials are for local
development only and must never be reused in a real deployment.
`scripts/create-production-db-role.sh` generates a strong random password
and a restricted, non-superuser Postgres role (`rsvp_app` by default) with
only the grants the app's migrations in `src/lib/db.ts` actually need —
`CONNECT`, schema `USAGE`/`CREATE`, and table-level `SELECT`/`INSERT`/
`UPDATE`/`DELETE` (including on future tables, via default privileges) — and
explicitly withholds `SUPERUSER`/`CREATEDB`/`CREATEROLE`/replication. Run it
against your production Postgres server (or the existing dev container, to
test the mechanism itself):

```bash
./scripts/create-production-db-role.sh
```

It prints a ready-to-use `DATABASE_URL`. The Linux Mint installer already
performs this role setup automatically; this standalone helper remains useful
for testing or a different Postgres host. It does not touch local development.

### Other useful commands

- `npm run dev` — just the Next.js dev server (assumes Postgres is already up)
- `npm run db:up` / `npm run db:down` — just the Postgres container (`db:down` also fully quits Docker Desktop and WSL)
- `npm run lint` — ESLint
- `npx tsc --noEmit` — typecheck

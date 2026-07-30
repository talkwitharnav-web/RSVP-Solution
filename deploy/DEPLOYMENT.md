# RSVP Server Guide

This is the plain-English guide for putting RSVP on the Linux Mint machine and keeping it running.

## The whole project in human terms

There is one codebase. Development and production do not have separate copies of the features.

- **Development** runs on the Windows computer. Saving a file updates the development site automatically. Its test database stays on Windows.
- **Production** runs on the Linux Mint computer. It uses the same committed code, but the code is built into a faster, stable form before it starts. Its real database stays on Linux.
- **GitHub** carries approved code from Windows to Linux. You commit and push on Windows, then run `sudo rsvp update` on Linux.
- **Postgres** stores accounts, invitations, designs, and guest responses. It runs privately in Docker and cannot be reached from the internet.
- **Node.js** runs the website and its live WebSocket updates. It listens only inside the Linux machine at `127.0.0.1:3001`.
- **Cloudflare Tunnel** is the secure public doorway. It makes an outbound connection from Linux to Cloudflare, so no website port is opened on the router.
- **systemd** is Linux's service manager. It starts the database and website after a reboot and restarts the website after a crash.
- **Backups** are verified Postgres backup files created every night and retained for 14 days.

The public path is:

```text
Guest's phone -> Cloudflare HTTPS -> Cloudflare Tunnel -> RSVP on Linux -> Postgres
```

The admin path is deliberately different. Cloudflare visitors get a 404 from admin pages. Admin is reached through a private SSH connection described below.

## What the setup command does

`sudo bash ./server-setup.sh` performs the full machine setup:

1. Installs Docker, Node.js 22, Git, SSH, Cloudflare Tunnel, the firewall, and supporting tools.
2. Creates a locked-down Linux account named `rsvp` for the website service.
3. Clones the public GitHub repository into `/opt/rsvp/app`.
4. Generates unique database and login-session secrets.
5. Asks for the admin username and password directly in the Linux terminal. They are never sent through chat or committed to Git.
6. Starts a fresh Postgres 16 production database.
7. Creates the restricted `rsvp_app` database role. It is not a database administrator.
8. Builds the optimized production website.
9. Installs automatic app, database, and backup services.
10. Creates and verifies the first database backup.
11. Offers to enable the firewall with only SSH allowed inbound.
12. Offers to disable automatic sleep if this is a dedicated server.

Private settings live in `/etc/rsvp`. Only root can read that directory. Database files live in a Docker volume named `rsvp-postgres-production-data`. Neither is inside Git.

## First installation

The deployment files must be committed and pushed to GitHub first. Then use the Linux Mint machine.

If SSH is not enabled yet, open Terminal directly on Linux and run:

```bash
sudo apt update
sudo apt install -y openssh-server
sudo systemctl enable --now ssh
hostname -I
```

`hostname -I` prints the Linux machine's local IP address. From Windows, connect with:

```powershell
ssh YOUR_LINUX_USER@THE_LINUX_IP
```

Then run on Linux:

```bash
git clone https://github.com/talkwitharnav-web/RSVP-Solution.git
cd RSVP-Solution
sudo bash ./server-setup.sh
```

Follow the short prompts. Use a fresh production database; do not copy the development database because it contains review and security-test records.

## Before a domain exists

The production app can be tested through a temporary Cloudflare address:

```bash
sudo rsvp preview
```

Cloudflare prints a random address ending in `trycloudflare.com`. Open it on another device and test the public sender and receiver flows. The address disappears when Ctrl+C is pressed and changes the next time the command runs. The app and database remain running.

This temporary address is for testing, not the final launch URL.

## When the domain is ready

First add the domain to the Cloudflare account and point its nameservers to Cloudflare. Then run one command on Linux, replacing the example hostname:

```bash
sudo rsvp domain rsvp.yourdomain.com
```

The command will:

1. Print a Cloudflare authorization URL if this server has not been approved before.
2. Create or reuse a named tunnel called `rsvp-production`.
3. Create the DNS record for the hostname.
4. Install and start the permanent tunnel service.
5. Check that the public sender page returns 200.
6. Check that the public admin page still returns 404.

The tunnel starts automatically after every reboot. No router port forwarding is needed.

## Normal commands

```bash
sudo rsvp status
```

Checks Node, Docker, Cloudflare, services, private network listeners, application health, database health, backups, and disk space.

```bash
sudo rsvp update
```

Downloads the newest `main` branch into a separate folder, installs dependencies, and builds it while the existing version keeps running. Only after the build passes does it switch versions and restart. If the new version does not become healthy, it automatically returns to the previous version.

```bash
sudo rsvp restart
sudo rsvp stop
sudo rsvp start
```

Restart, stop, or start the production stack. Stopping never deletes database files.

```bash
sudo rsvp logs app
sudo rsvp logs db
sudo rsvp logs tunnel
```

Shows live logs. Press Ctrl+C to stop watching; this does not stop the service.

```bash
sudo rsvp backup
sudo rsvp backups
```

Creates a verified backup immediately or lists the available backups. Nightly backups run automatically at about 3:15 AM. Important backups should also be copied to another physical machine or cloud drive because a backup stored only on the server cannot help if the server's drive dies.

```bash
sudo rsvp restore /var/backups/rsvp/rsvp-TIMESTAMP.dump
```

Restores a backup. It verifies the selected file, requires the exact words `RESTORE PRODUCTION`, and creates one more safety backup before replacing anything.

## Private admin access

Run this on the normal Windows computer:

```powershell
ssh -L 3001:127.0.0.1:3001 YOUR_LINUX_USER@THE_LINUX_IP
```

Leave that terminal open and visit `http://localhost:3001` in the Windows browser. The connection is securely carried through SSH to Linux. The public Cloudflare domain still cannot open admin pages.

The same instructions are available on Linux with:

```bash
sudo rsvp admin-help
```

## How code changes reach production

1. Change and test the development version on Windows.
2. Commit the change to Git.
3. Push it to GitHub.
4. On Linux, run `sudo rsvp update`.
5. Refresh the public website.

Restarting production by itself does not compile new source code. `sudo rsvp update` performs the download, build, safe switch, restart, and health check together.

## Where everything lives

| Item | Location |
| --- | --- |
| Current production code | `/opt/rsvp/app` |
| Older/failed releases | `/opt/rsvp/releases` |
| App and database secrets | `/etc/rsvp` |
| Cloudflare tunnel config | `/etc/cloudflared` |
| Database files | Docker volume `rsvp-postgres-production-data` |
| Database backups | `/var/backups/rsvp` |
| App service | `rsvp.service` |
| Database service | `rsvp-postgres.service` |
| Cloudflare service | `rsvp-cloudflared.service` |
| Backup schedule | `rsvp-backup.timer` |

## If something looks wrong

Start with:

```bash
sudo rsvp status
```

Then view the relevant logs:

```bash
sudo rsvp logs app
sudo rsvp logs db
sudo rsvp logs tunnel
```

Do not delete `/etc/rsvp`, the Docker volume, or `/var/backups/rsvp` as a troubleshooting shortcut. Those contain the production identity, real data, and recovery copies.
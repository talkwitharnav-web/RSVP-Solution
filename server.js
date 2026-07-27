const { createServer } = require("http");
const next = require("next");
const { WebSocketServer } = require("ws");

const port = parseInt(process.env.PORT || "3001", 10);
// Bind to all interfaces (not just localhost) so the app is reachable from
// other devices on the same LAN (e.g. a phone) via this machine's
// 192.168.x.x address -- needed to test under real external-network
// conditions rather than only from the machine running the server.
const hostname = process.env.HOST || "0.0.0.0";
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, hostname });
const handle = app.getRequestHandler();

// Every connected client, plus the interval handle for the heartbeat push
// below -- kept on globalThis (not a plain module-level variable) so a
// value survives Next's dev-mode module reloads instead of quietly
// duplicating a second heartbeat interval on every hot reload.
globalThis.__rsvpWsClients = globalThis.__rsvpWsClients || new Set();
const clients = globalThis.__rsvpWsClients;

const HEARTBEAT_INTERVAL_MS = 10000;

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}

// Exposed on globalThis so API route handlers (running in this same Node
// process, just through Next's request handler rather than server.js's own
// code) can push a live update without needing their own WS client -- e.g.
// broadcasting "db-changed" from POST /api/sender/register the instant a
// user row is inserted, so /admin/db can refresh without polling.
globalThis.__rsvpBroadcast = broadcast;

app.prepare().then(() => {
  const server = createServer((req, res) => {
    // Route handlers (App Router) have no direct access to the raw socket,
    // so the real client IP is stamped on as a header here -- used by
    // src/lib/rate-limit.ts to key its per-IP buckets. Always overwritten
    // (never trusts an incoming x-forwarded-for), since there's no reverse
    // proxy in front of this server to have set it legitimately -- letting
    // a client set its own would make the rate limiter trivially bypassable.
    req.headers["x-forwarded-for"] = req.socket.remoteAddress || "unknown";
    handle(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws) => {
    clients.add(ws);
    // Send an immediate heartbeat on connect so the client doesn't sit in
    // "unknown" status for up to HEARTBEAT_INTERVAL_MS after first opening.
    ws.send(JSON.stringify({ type: "heartbeat", status: "healthy", at: Date.now() }));
    ws.on("close", () => clients.delete(ws));
  });

  const nextUpgradeHandler = app.getUpgradeHandler();

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);

    if (pathname === "/ws") {
      // Same-origin check, matching the reference project's rationale: a
      // browser WS handshake always sends Origin, so requiring it to match
      // Host blocks arbitrary other sites from connecting and listening in.
      // No LAN/non-browser exception here -- RSVP has no non-browser client
      // yet, unlike the reference project's Expo app.
      const origin = req.headers.origin;
      const host = req.headers.host;
      let originHost = null;
      if (origin) {
        try {
          originHost = new URL(origin).host;
        } catch {
          originHost = null;
        }
      }
      if (!origin || originHost !== host) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws);
      });
    } else {
      // Delegate everything else (Next's own dev-mode HMR websocket) to Next.
      nextUpgradeHandler(req, socket, head);
    }
  });

  if (!globalThis.__rsvpHeartbeatInterval) {
    globalThis.__rsvpHeartbeatInterval = setInterval(() => {
      broadcast({ type: "heartbeat", status: "healthy", at: Date.now() });
    }, HEARTBEAT_INTERVAL_MS);
  }

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://localhost:${port} (ws endpoint: /ws)`);
    console.log(`> Also reachable on your LAN at http://<this-machine-IP>:${port}`);
  });
});

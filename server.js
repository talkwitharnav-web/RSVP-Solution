if (process.argv.includes("--production")) {
  process.env.NODE_ENV = "production";
}

const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

const sessionSecret = process.env.SESSION_SECRET || "";
if (Buffer.byteLength(sessionSecret) < 32) {
  throw new Error("SESSION_SECRET must be configured with at least 32 bytes before the server can start.");
}
if (process.env.NODE_ENV === "production" && process.env.FORCE_SECURE_COOKIES !== "true") {
  throw new Error(
    "FORCE_SECURE_COOKIES=true is required in production. Serve the app behind HTTPS before starting it.",
  );
}

const { createServer } = require("http");
const { isIP } = require("net");
const { networkInterfaces } = require("os");
const next = require("next");
const { WebSocketServer } = require("ws");

const port = parseInt(process.env.PORT || "3001", 10);
const dev = process.env.NODE_ENV !== "production";
// Bind to all interfaces (not just localhost) so the app is reachable from
// other devices on the same LAN (e.g. a phone) via this machine's
// 192.168.x.x address -- needed to test under real external-network
// conditions rather than only from the machine running the server.
// Production defaults to loopback so a TLS reverse proxy is the only public
// listener; an explicit HOST can override this for a container whose network
// policy already prevents direct access to the Node port.
const hostname = process.env.HOST || (dev ? "0.0.0.0" : "127.0.0.1");
const trustedProxyIps = new Set(
  (process.env.TRUSTED_PROXY_IPS || (dev ? "" : "127.0.0.1,::1,::ffff:127.0.0.1"))
    .split(",")
    .map((ip) => normalizeIp(ip))
    .filter(Boolean),
);
const app = next({ dev, hostname });
const handle = app.getRequestHandler();
const SMALL_API_BODY_BYTES = 64 * 1024;
const MEDIA_API_BODY_BYTES = 16 * 1024 * 1024;

function apiBodyLimit(req) {
  let pathname;
  try {
    pathname = new URL(req.url || "/", "http://localhost").pathname;
  } catch {
    return null;
  }

  const method = req.method || "GET";
  if (
    (method === "POST" && pathname === "/api/events") ||
    (method === "PUT" && /^\/api\/events\/[^/]+$/.test(pathname))
  ) {
    return MEDIA_API_BODY_BYTES;
  }

  if (
    (method === "POST" && [
      "/api/admin/login",
      "/api/dev/db",
      "/api/logout",
      "/api/sender/login",
      "/api/sender/register",
    ].includes(pathname)) ||
    (method === "DELETE" && pathname === "/api/dev/db") ||
    (method === "POST" && /^\/api\/events\/[^/]+\/rsvps$/.test(pathname)) ||
    (method === "PUT" && /^\/api\/users\/[^/]+(?:\/password)?$/.test(pathname))
  ) {
    return SMALL_API_BODY_BYTES;
  }

  return null;
}

function rejectInvalidBodyFraming(req, res, maxBytes) {
  const contentType = req.headers["content-type"];
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
    sendJsonError(res, 415, "Content-Type must be application/json");
    return true;
  }

  const origin = req.headers.origin;
  if (origin) {
    let originHost;
    try {
      originHost = new URL(origin).host;
    } catch {
      sendJsonError(res, 403, "Cross-origin request rejected");
      return true;
    }
    if (!req.headers.host || originHost !== req.headers.host) {
      sendJsonError(res, 403, "Cross-origin request rejected");
      return true;
    }
  }

  if (req.headers["transfer-encoding"]) {
    sendJsonError(res, 413, "Transfer-encoded request bodies are not supported");
    return true;
  }

  const contentLength = req.headers["content-length"];
  if (typeof contentLength !== "string") {
    sendJsonError(res, 411, "Content-Length is required");
    return true;
  }
  if (!/^\d+$/.test(contentLength)) {
    sendJsonError(res, 400, "Invalid Content-Length");
    return true;
  }

  const declaredBytes = Number(contentLength);
  if (!Number.isSafeInteger(declaredBytes) || declaredBytes > maxBytes) {
    sendJsonError(res, 413, "Request body too large");
    return true;
  }
  return false;
}

function sendJsonError(res, status, error) {
  const payload = JSON.stringify({ error });
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Connection": "close",
    "Content-Length": Buffer.byteLength(payload),
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(payload);
}

function isLoopbackAddress(address) {
  if (!address) return false;
  const normalized = normalizeIp(address);
  return normalized === "::1" || normalized === "127.0.0.1" || normalized === "::ffff:127.0.0.1";
}

function normalizeIp(address) {
  return typeof address === "string" ? address.trim().toLowerCase().split("%")[0] : "";
}

function clientIpForRequest(req) {
  const socketIp = normalizeIp(req.socket.remoteAddress) || "unknown";
  if (dev || !trustedProxyIps.has(socketIp)) return socketIp;

  // Cloudflare Tunnel sends the visitor address in CF-Connecting-IP. Only
  // trust it after the direct socket has passed the trusted-proxy check
  // above, so a public client can never grant itself a different identity
  // by adding this header to a request sent straight to Node.
  const cloudflareIp = normalizeIp(req.headers["cf-connecting-ip"]);
  if (cloudflareIp && isIP(cloudflareIp)) return cloudflareIp;

  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor !== "string") return socketIp;
  const candidates = forwardedFor.split(",").map((value) => normalizeIp(value)).filter(Boolean);
  // The trusted proxy is the final hop before Node. Reading from the right
  // prevents an attacker-supplied leftmost XFF value from winning when a
  // proxy appends its observed client address instead of replacing XFF.
  const candidate = candidates.at(-1);
  return candidate && isIP(candidate) ? candidate : socketIp;
}

function isValidHostHeader(host) {
  if (typeof host !== "string" || host.length === 0 || host.length > 255) return false;
  try {
    const parsed = new URL(`http://${host}`);
    return !parsed.username && !parsed.password && parsed.host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

// Every connected client, plus the interval handle for the heartbeat push
// below -- kept on globalThis (not a plain module-level variable) so a
// value survives Next's dev-mode module reloads instead of quietly
// duplicating a second heartbeat interval on every hot reload.
globalThis.__rsvpWsClients = globalThis.__rsvpWsClients || new Set();
const clients = globalThis.__rsvpWsClients;

const HEARTBEAT_INTERVAL_MS = 10000;
// The client set is unbounded otherwise -- anything on the LAN could hold
// open as many sockets as it liked and grow this process's memory with it.
// Far above any plausible real usage (a handful of tabs per guest).
const MAX_WS_CLIENTS = 200;
const MAX_WS_CLIENTS_PER_IP = 20;
const MAX_WS_HANDSHAKES_PER_MINUTE = 60;
const WS_HANDSHAKE_WINDOW_MS = 60 * 1000;
const WS_MAX_PAYLOAD_BYTES = 1024;
globalThis.__rsvpWsHandshakeWindows = globalThis.__rsvpWsHandshakeWindows || new Map();
const wsHandshakeWindows = globalThis.__rsvpWsHandshakeWindows;

function allowWsHandshake(clientIp) {
  const now = Date.now();
  const current = wsHandshakeWindows.get(clientIp);
  if (!current || current.resetAt <= now) {
    wsHandshakeWindows.set(clientIp, { count: 1, resetAt: now + WS_HANDSHAKE_WINDOW_MS });
  } else if (current.count >= MAX_WS_HANDSHAKES_PER_MINUTE) {
    return false;
  } else {
    current.count += 1;
  }

  if (wsHandshakeWindows.size > 1000) {
    for (const [ip, window] of wsHandshakeWindows) {
      if (window.resetAt <= now) wsHandshakeWindows.delete(ip);
    }
  }
  return true;
}

function activeWsClientsForIp(clientIp) {
  let count = 0;
  for (const ws of clients) {
    if (ws.clientIp === clientIp && ws.readyState === ws.OPEN) count += 1;
  }
  return count;
}

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
    if (!isValidHostHeader(req.headers.host)) {
      sendJsonError(res, 400, "Invalid Host header");
      return;
    }

    let pathname = "/";
    try {
      pathname = new URL(req.url || "/", "http://localhost").pathname;
    } catch {
      sendJsonError(res, 400, "Invalid request URL");
      return;
    }

    if (dev && pathname.endsWith(".map") && !isLoopbackAddress(req.socket.remoteAddress)) {
      sendJsonError(res, 404, "Not found");
      return;
    }

    if (req.method === "TRACE") {
      const payload = "Method Not Allowed";
      res.writeHead(405, {
        "Allow": "GET, HEAD, POST, PUT, DELETE, OPTIONS",
        "Cache-Control": "no-store",
        "Content-Length": Buffer.byteLength(payload),
        "Content-Type": "text/plain; charset=utf-8",
      });
      res.end(payload);
      return;
    }

    const bodyLimit = apiBodyLimit(req);
    if (bodyLimit !== null && rejectInvalidBodyFraming(req, res, bodyLimit)) return;

    // Route handlers (App Router) have no direct access to the raw socket,
    // so the real client IP is stamped on as a header here -- used by
    // src/lib/rate-limit.ts to key its per-IP buckets. Always overwritten
    // (never trusts an incoming x-forwarded-for), since there's no reverse
    // proxy in front of this server to have set it legitimately -- letting
    // a client set its own would make the rate limiter trivially bypassable.
    req.headers["x-forwarded-for"] = clientIpForRequest(req);
    handle(req, res);
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: WS_MAX_PAYLOAD_BYTES });

  wss.on("connection", (ws, req) => {
    ws.clientIp = req.headers["x-forwarded-for"] || normalizeIp(req.socket.remoteAddress) || "unknown";
    clients.add(ws);
    // Liveness flag for the ping sweep below -- a client that drops off the
    // network without a clean close (phone leaves wifi, laptop sleeps) leaves
    // a socket that still reports readyState OPEN, so without an explicit
    // ping/pong those entries accumulate in `clients` and every broadcast
    // keeps writing to them.
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });
    // Send an immediate heartbeat on connect so the client doesn't sit in
    // "unknown" status for up to HEARTBEAT_INTERVAL_MS after first opening.
    ws.send(JSON.stringify({ type: "heartbeat", status: "healthy", at: Date.now() }));
    ws.on("message", () => {
      ws.close(1008, "Client messages are not supported");
    });
    ws.on("close", () => clients.delete(ws));
    ws.on("error", () => clients.delete(ws));
  });

  const nextUpgradeHandler = app.getUpgradeHandler();

  server.on("upgrade", (req, socket, head) => {
    if (!isValidHostHeader(req.headers.host)) {
      socket.destroy();
      return;
    }

    let pathname;
    try {
      pathname = new URL(req.url || "/", "http://localhost").pathname;
    } catch {
      socket.destroy();
      return;
    }

    if (pathname === "/ws") {
      const clientIp = clientIpForRequest(req);
      req.headers["x-forwarded-for"] = clientIp;
      if (!allowWsHandshake(clientIp)) {
        socket.destroy();
        return;
      }

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

      if (clients.size >= MAX_WS_CLIENTS || activeWsClientsForIp(clientIp) >= MAX_WS_CLIENTS_PER_IP) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      // Delegate everything else (Next's own dev-mode HMR websocket) to Next.
      nextUpgradeHandler(req, socket, head);
    }
  });

  if (!globalThis.__rsvpHeartbeatInterval) {
    globalThis.__rsvpHeartbeatInterval = setInterval(() => {
      // Drop anything that didn't answer the previous ping before sending the
      // next round, so half-open sockets are reaped rather than accumulating.
      for (const ws of clients) {
        if (ws.isAlive === false) {
          clients.delete(ws);
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        try {
          ws.ping();
        } catch {
          clients.delete(ws);
        }
      }
      broadcast({ type: "heartbeat", status: "healthy", at: Date.now() });
    }, HEARTBEAT_INTERVAL_MS);
  }

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://localhost:${port} (ws endpoint: /ws)`);
    const lanAddresses = hostname === "0.0.0.0" || hostname === "::" ? findLanAddresses() : [];
    if (lanAddresses.length > 0) {
      for (const address of lanAddresses) {
        console.log(`> On your network:  http://${address}:${port}`);
      }
      console.log(
        "> If a phone on the same Wi-Fi can't load that, Windows Firewall is blocking it —\n" +
        ">   run scripts/allow-lan.ps1 once from an elevated PowerShell.",
      );
    } else if (dev) {
      console.log("> No LAN address detected (not connected to a network?)");
    } else {
      console.log("> Production listener is loopback-only; terminate HTTPS at a reverse proxy.");
    }
    console.log(
      "> Admin pages (/ and /admin/*) are localhost-only by design.",
    );
  });
});

/**
 * The real addresses another device on the same network can reach this
 * machine at. Printing a literal "<this-machine-IP>" placeholder meant the
 * first thing anyone had to do was go dig the address out of ipconfig.
 * Virtual adapters (WSL, Hyper-V's Default Switch) and link-local 169.254.x
 * fallbacks are filtered out -- they're real IPv4 addresses but nothing on
 * the actual Wi-Fi can route to them, so listing them just misleads.
 */
function findLanAddresses() {
  const addresses = [];
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    if (/WSL|Default Switch|Bluetooth|Loopback|vEthernet/i.test(name)) continue;
    for (const entry of entries || []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      if (entry.address.startsWith("169.254.")) continue;
      addresses.push(entry.address);
    }
  }
  return addresses;
}

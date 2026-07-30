#!/usr/bin/env node
/**
 * Minimal TLS-terminating reverse proxy for local production testing.
 *
 * This is NOT meant to replace a real production proxy (nginx/Caddy/a cloud
 * load balancer) in a real deployment -- it exists because this dev machine
 * has neither installed, and the app still needs something that actually
 * terminates HTTPS in front of it to verify the production security
 * contract end-to-end (see README.md's Production section and
 * SYSTEM_MEMORY.md's "Production boundary"). A real deployment should swap
 * this for nginx/Caddy/a managed load balancer using the same header rules
 * below as the spec to match.
 *
 * What it does, matching exactly what server.js expects from a trusted proxy:
 *   - Terminates TLS using a certificate (self-signed for local testing;
 *     point TLS_CERT_FILE/TLS_KEY_FILE at a real CA-issued pair in a real
 *     deployment).
 *   - Forwards to the Node app (default http://127.0.0.1:3001) preserving
 *     the original Host header unchanged (server.js validates Host itself;
 *     this proxy must not rewrite it).
 *   - Sets X-Forwarded-For to the real client's socket address, appended
 *     after any existing value -- server.js reads the RIGHTMOST address in
 *     that header and only trusts it when the immediate socket peer
 *     (this proxy, from the app's point of view) is listed in
 *     TRUSTED_PROXY_IPS. Appending (not overwriting) means a spoofed
 *     leftmost value from a client still can't win.
 *   - Sets X-Forwarded-Proto: https so the app can tell the original
 *     request arrived over TLS even though the app<-proxy hop is plain HTTP.
 *   - Proxies the /ws WebSocket upgrade the same way (Host, XFF).
 *   - Sends HSTS itself is NOT required here -- server.js already emits
 *     Strict-Transport-Security in production; this proxy just needs to not
 *     strip it.
 *
 * Usage:
 *   node scripts/tls-proxy.mjs
 *
 * Env vars (all optional, defaults shown):
 *   TLS_PORT=8443            Port the proxy listens on (HTTPS).
 *   TLS_CERT_FILE=./certs/dev-proxy-cert.pem
 *   TLS_KEY_FILE=./certs/dev-proxy-key.pem
 *   UPSTREAM_HOST=127.0.0.1  Where the Node app (server.js) is listening.
 *   UPSTREAM_PORT=3001
 *
 * Generate a local self-signed cert first with scripts/generate-dev-cert.sh
 * (or .ps1). A real deployment replaces those two files with a real
 * CA-issued certificate/key and does not need this script's cert generator.
 */

import { request as httpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const TLS_PORT = parseInt(process.env.TLS_PORT || "8443", 10);
const UPSTREAM_HOST = process.env.UPSTREAM_HOST || "127.0.0.1";
const UPSTREAM_PORT = parseInt(process.env.UPSTREAM_PORT || "3001", 10);
const CERT_FILE = process.env.TLS_CERT_FILE || path.join(repoRoot, "certs", "dev-proxy-cert.pem");
const KEY_FILE = process.env.TLS_KEY_FILE || path.join(repoRoot, "certs", "dev-proxy-key.pem");

if (!existsSync(CERT_FILE) || !existsSync(KEY_FILE)) {
  console.error(`TLS cert/key not found.\n  cert: ${CERT_FILE}\n  key:  ${KEY_FILE}`);
  console.error(
    "Generate a local self-signed pair first:\n" +
      "  bash scripts/generate-dev-cert.sh\n" +
      "or (PowerShell):\n" +
      "  powershell -ExecutionPolicy Bypass -File scripts/generate-dev-cert.ps1",
  );
  process.exit(1);
}

const tlsOptions = {
  cert: readFileSync(CERT_FILE),
  key: readFileSync(KEY_FILE),
};

function appendForwardedFor(existing, socketAddress) {
  const clientIp = normalizeIp(socketAddress);
  if (typeof existing === "string" && existing.length > 0) {
    return `${existing}, ${clientIp}`;
  }
  return clientIp;
}

function normalizeIp(address) {
  if (!address) return "unknown";
  // Strip the ::ffff: IPv4-mapped prefix so the app sees a plain IPv4
  // address when the proxy's socket reports one -- matches what server.js's
  // own normalizeIp()/TRUSTED_PROXY_IPS defaults expect.
  return address.startsWith("::ffff:") ? address.slice(7) : address;
}

function buildForwardedHeaders(req) {
  const headers = { ...req.headers };
  headers["x-forwarded-for"] = appendForwardedFor(req.headers["x-forwarded-for"], req.socket.remoteAddress);
  headers["x-forwarded-proto"] = "https";
  headers["x-forwarded-host"] = req.headers.host || "";
  // Host is intentionally left untouched -- server.js validates and uses it
  // directly, and a real proxy in front of a real domain must also forward
  // the original Host unchanged.
  return headers;
}

const server = createHttpsServer(tlsOptions, (clientReq, clientRes) => {
  const forwardedHeaders = buildForwardedHeaders(clientReq);
  proxyRequest(clientReq, clientRes, forwardedHeaders);
});

function proxyRequest(clientReq, clientRes, forwardedHeaders) {
  const upstreamReq = httpRequest(
    {
      hostname: UPSTREAM_HOST,
      port: UPSTREAM_PORT,
      path: clientReq.url,
      method: clientReq.method,
      headers: forwardedHeaders,
    },
    (upstreamRes) => {
      clientRes.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(clientRes);
    },
  );

  upstreamReq.on("error", (err) => {
    console.error("[tls-proxy] upstream request error:", err.message);
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    }
    clientRes.end(JSON.stringify({ error: "Bad gateway" }));
  });

  clientReq.pipe(upstreamReq);
}

server.on("upgrade", (req, clientSocket, head) => {
  const forwardedHeaders = buildForwardedHeaders(req);

  const upstreamReq = httpRequest({
    hostname: UPSTREAM_HOST,
    port: UPSTREAM_PORT,
    path: req.url,
    method: req.method,
    headers: forwardedHeaders,
  });

  upstreamReq.on("upgrade", (upstreamRes, upstreamSocket, upstreamHead) => {
    clientSocket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
        Object.entries(upstreamRes.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\r\n") +
        "\r\n\r\n",
    );
    if (upstreamHead && upstreamHead.length) upstreamSocket.unshift(upstreamHead);
    if (head && head.length) clientSocket.unshift(head);
    upstreamSocket.pipe(clientSocket);
    clientSocket.pipe(upstreamSocket);
  });

  upstreamReq.on("error", (err) => {
    console.error("[tls-proxy] upstream upgrade error:", err.message);
    clientSocket.destroy();
  });

  upstreamReq.end();
});

server.listen(TLS_PORT, () => {
  console.log(`> TLS proxy listening on https://localhost:${TLS_PORT}`);
  console.log(`> Forwarding to http://${UPSTREAM_HOST}:${UPSTREAM_PORT}`);
  console.log(`> Cert: ${CERT_FILE}`);
  console.log("> This is a local-testing proxy only -- use nginx/Caddy/a real load balancer in production.");
});

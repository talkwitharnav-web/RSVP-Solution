// Thin wrapper around the broadcast function server.js exposes on
// globalThis (see server.js's own comment) -- lets API route handlers push
// a live WS message without holding a WebSocket client themselves. No-op if
// the WS server hasn't set it yet (e.g. very first request during startup).
export function broadcastDbChanged(kind: "users" | "events") {
  const fn = (globalThis as unknown as { __rsvpBroadcast?: (msg: unknown) => void }).__rsvpBroadcast;
  fn?.({ type: "db-changed", kind, at: Date.now() });
}

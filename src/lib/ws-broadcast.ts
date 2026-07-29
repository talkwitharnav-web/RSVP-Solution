// Thin wrapper around the broadcast function server.js exposes on
// globalThis (see server.js's own comment) -- lets API route handlers push
// a live WS message without holding a WebSocket client themselves. No-op if
// the WS server hasn't set it yet (e.g. very first request during startup).
export function broadcastDbChanged(kind: "users" | "events") {
  const fn = (globalThis as unknown as { __rsvpBroadcast?: (msg: unknown) => void }).__rsvpBroadcast;
  fn?.({ type: "db-changed", kind, at: Date.now() });
}

/**
 * A targeted companion to broadcastDbChanged("users") -- that broadcast
 * alone gives every connected client no reason to react to a change to
 * someone ELSE's account, but a deleted user's own already-open tab(s) need
 * to actually know. Without this, requireSender() only ever verifies the
 * signed session cookie, never that the underlying users row still exists,
 * so a deleted account's browser tab keeps behaving as if logged in --
 * every fetch it fires still carries a validly-signed cookie for a user
 * that no longer exists, so pages don't 401 outright, they just start
 * returning empty/broken data (a "ghost session") until something finally
 * surfaces an error deep enough to notice. Carrying the deleted userId lets
 * every client cheaply compare against its own session and self-log-out
 * only when it's actually the affected account, rather than every tab
 * re-querying "does the user I'm logged in as still exist?" on every
 * unrelated users change.
 */
export function broadcastUserDeleted(userId: string) {
  const fn = (globalThis as unknown as { __rsvpBroadcast?: (msg: unknown) => void }).__rsvpBroadcast;
  fn?.({ type: "user-deleted", userId, at: Date.now() });
}

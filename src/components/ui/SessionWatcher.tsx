"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWebSocket } from "@/lib/useWebSocket";
import { useToast } from "@/components/ui/Toast";

/**
 * Mounted once in the root layout (alongside GlobalSettingsToggles) so it
 * can catch a `user-deleted` broadcast from any page a logged-in sender
 * might be sitting on -- not just /sender.
 *
 * Without this, `requireSender()` only ever checks that the session cookie
 * is validly *signed*, never that the underlying `users` row it names still
 * exists. If an admin deletes that account from Access DB while the sender
 * is mid-session elsewhere, their browser tab doesn't notice: the cookie is
 * still a genuine, correctly-signed token, so every fetch it fires keeps
 * "succeeding" at the auth layer -- it's only later, when a query joins
 * against a `created_by` that no longer resolves to anything, that things
 * start silently breaking (empty invitation lists, RSVP saves failing for
 * no visible reason). That's the "ghost session" this closes: the deleted
 * account's own tab(s) get a real, immediate, explained logout instead of
 * slowly rotting until some deep-enough query finally surfaces an error.
 *
 * `broadcastUserDeleted` (src/lib/ws-broadcast.ts) carries the deleted
 * user's id specifically so this can cheaply compare against its own
 * session and only act when it's actually the affected account -- every
 * other sender's tab ignores a broadcast naming someone else's id.
 */
export function SessionWatcher() {
  const router = useRouter();
  const showToast = useToast();
  const [senderUserId, setSenderUserId] = useState<string | null>(null);
  const { messagesByType } = useWebSocket();
  const userDeleted = messagesByType["user-deleted"] as { userId?: string } | undefined;
  // Re-entrancy guard for the effect below, not render-relevant state -- a
  // ref so setting it doesn't itself trigger a re-render/lint warning about
  // synchronous setState in an effect.
  const handledRef = useRef(false);

  useEffect(() => {
    fetch("/api/session")
      .then((res) => res.json())
      .then((session) => setSenderUserId(session.sender?.userId ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!senderUserId || !userDeleted || userDeleted.userId !== senderUserId || handledRef.current) return;
    handledRef.current = true;

    fetch("/api/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "sender" }),
    })
      .catch(() => {
        // The cookie clear is best-effort here -- the redirect below sends
        // the sender to a logged-out-looking page regardless, and any stale
        // cookie left behind fails ownership checks server-side anyway
        // (the user row is genuinely gone), it just wouldn't look logged-
        // out client-side.
      })
      .finally(() => {
        showToast("Your account was removed by an admin — you've been logged out.", "warning");
        router.replace("/sender/landing");
      });
  }, [userDeleted, senderUserId, router, showToast]);

  return null;
}

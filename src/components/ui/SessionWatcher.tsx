"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWebSocket } from "@/lib/useWebSocket";
import { useToast } from "@/components/ui/Toast";

/**
 * Mounted once in the root layout (alongside GlobalSettingsToggles) so it
 * can catch a session-state broadcast from any page a logged-in sender
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
 * Broadcasts deliberately carry no user id. Every connected sender checks
 * its own no-store session endpoint, and only the browser whose persisted
 * session was actually revoked acts. Raw WebSocket listeners therefore
 * cannot collect account identifiers from administrative changes.
 */
export function SessionWatcher() {
  const router = useRouter();
  const showToast = useToast();
  const [senderUserId, setSenderUserId] = useState<string | null>(null);
  const { messagesByType } = useWebSocket();
  const sessionStateChanged = messagesByType["session-state-changed"] as
    | { reason?: "account-deleted" | "password-reset" }
    | undefined;
  // Re-entrancy guard for the effect below, not render-relevant state -- a
  // ref so setting it doesn't itself trigger a re-render/lint warning about
  // synchronous setState in an effect.
  const handledRef = useRef(false);
  const checkingRef = useRef(false);

  useEffect(() => {
    fetch("/api/session")
      .then((res) => res.json())
      .then((session) => setSenderUserId(session.sender?.userId ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!senderUserId || !sessionStateChanged || handledRef.current || checkingRef.current) return;
    checkingRef.current = true;

    fetch("/api/session")
      .then((response) => response.json())
      .then((session) => {
        if (session.sender?.userId === senderUserId) return;
        handledRef.current = true;
        showToast(
          sessionStateChanged.reason === "account-deleted"
            ? "Your account was removed by an admin — you've been logged out."
            : "Your password was changed — sign in again to continue.",
          "warning",
        );
        router.replace("/sender/landing");
      })
      .catch(() => {
        // The unconditional server-side session check remains the backstop;
        // retry on the next session-state broadcast or protected request.
      })
      .finally(() => {
        checkingRef.current = false;
      });
  }, [sessionStateChanged, senderUserId, router, showToast]);

  return null;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";

/**
 * Client-side prediction for mutations -- the same trick multiplayer games
 * use. The UI assumes the server will accept the action and updates
 * immediately; the request goes out in the background; if the server
 * disagrees, the local change is rolled back and the user is told.
 *
 * Why a shared helper rather than ad hoc `setX(...)` before each fetch:
 *  - Rollback is the part that's easy to forget, and getting it wrong leaves
 *    the UI permanently lying about what's in the database. `apply()` is
 *    forced to hand back its own undo function, so the two always live
 *    together in the same block of code.
 *  - `pendingRef` lets a screen that also live-refetches (this app's
 *    `db-changed` WebSocket push) know not to clobber an unconfirmed local
 *    change with server data that predates it -- see `/admin/db`.
 *
 * Deliberately NOT used for destructive, typed-confirmation operations
 * (Seed / Purge): there, correctness beats latency and pretending the data
 * is already gone is the wrong lie to tell.
 */

/** Undoes whatever `apply()` did. Must be safe to call once, later. */
export type RollbackFn = () => void;

export interface OptimisticAction<T> {
  /**
   * Applies the change locally, right now. Returns the rollback to run if
   * the server rejects it. Should only touch local state -- no requests.
   */
  apply: () => RollbackFn;
  /** Sends the change to the server. A rejection means "server said no". */
  commit: () => Promise<T>;
  /**
   * Prefixes the failure notification, e.g. "Couldn't delete Ava" becomes
   * "Couldn't delete Ava — not found". Without one the server's own message
   * is shown on its own.
   */
  errorLabel?: string;
  /** Set false to handle failure entirely yourself, with no notification. */
  notifyOnError?: boolean;
  /** Server accepted. Good place to reconcile with the authoritative row. */
  onConfirmed?: (result: T) => void;
  /** Server refused; the rollback has already run by the time this fires. */
  onRejected?: (error: Error) => void;
}

export type OptimisticResult<T> =
  | { ok: true; result: T }
  | { ok: false; error: Error };

export function useOptimisticActions() {
  const [pendingCount, setPendingCount] = useState(0);
  const showToast = useToast();
  // Mirrors pendingCount without waiting for a re-render, so effects that
  // fire from outside React (a WebSocket message) can read it synchronously.
  const pendingRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(
    async <T,>(action: OptimisticAction<T>): Promise<OptimisticResult<T>> => {
      const rollback = action.apply();
      pendingRef.current += 1;
      setPendingCount(pendingRef.current);
      try {
        const result = await action.commit();
        if (mountedRef.current) action.onConfirmed?.(result);
        return { ok: true, result };
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Something went wrong");
        // Only worth undoing if there's still a UI to undo it in.
        if (mountedRef.current) {
          rollback();
          action.onRejected?.(error);
        }
        // The whole point of predicting the result is that the user has
        // already moved on -- an inline error where the button used to be
        // can go unnoticed, so a failure always raises a notification
        // unless the caller explicitly opts out. This fires even if the
        // component unmounted, since the provider lives in the root layout.
        if (action.notifyOnError !== false) {
          showToast(action.errorLabel ? `${action.errorLabel} — ${error.message}` : error.message, "error");
        }
        return { ok: false, error };
      } finally {
        pendingRef.current = Math.max(0, pendingRef.current - 1);
        if (mountedRef.current) setPendingCount(pendingRef.current);
      }
    },
    [showToast],
  );

  return { run, pendingCount, hasPending: pendingCount > 0, pendingRef };
}

/**
 * Rollback for "I removed an item from a list" -- puts it back where it was
 * instead of restoring a whole snapshot, so a second, unrelated optimistic
 * change made in the meantime isn't resurrected along with it.
 */
export function reinsertAt<T>(list: T[], item: T, index: number): T[] {
  const next = [...list];
  next.splice(Math.min(Math.max(index, 0), next.length), 0, item);
  return next;
}

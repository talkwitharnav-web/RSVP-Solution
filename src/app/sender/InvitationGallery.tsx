"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowRight, FileImage, ChartPie, Link2, Check, Trash2 } from "lucide-react";
import { useDropdownReveal } from "@/lib/useDropdownReveal";
import { useWebSocket } from "@/lib/useWebSocket";
import { useOptimisticActions, reinsertAt } from "@/lib/optimistic";
import { useToast } from "@/components/ui/Toast";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { StatsModal } from "./StatsModal";
import type { SenderEventSummary } from "@/lib/types";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Failed to load invitations");
  return json;
}

export function InvitationGallery() {
  const showToast = useToast();
  const [events, setEvents] = useState<SenderEventSummary[] | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { messagesByType } = useWebSocket();
  const dbChanged = messagesByType["db-changed"];
  const { run } = useOptimisticActions();

  const load = (offset = 0, append = false) => {
    fetchJson<{ events: SenderEventSummary[]; nextOffset: number | null }>(`/api/sender/events?offset=${offset}`)
      .then((data) => {
        setEvents((previous) => {
          if (!append || !previous) return data.events;
          const existingIds = new Set(previous.map((event) => event.id));
          return [...previous, ...data.events.filter((event) => !existingIds.has(event.id))];
        });
        setNextOffset(data.nextOffset);
        setError(null);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Something went wrong";
        setError(message);
        showToast(`Couldn't load your invitations \u2014 ${message}`, "error");
      })
      .finally(() => setLoadingMore(false));
  };

  // The card disappears immediately and comes back where it was if the
  // server refuses -- see lib/optimistic.ts. Lives here (not InvitationCard)
  // since `events` is this component's own state.
  const deleteEvent = (event: SenderEventSummary, index: number) => {
    void run({
      apply: () => {
        setEvents((prev) => (prev ? prev.filter((e) => e.id !== event.id) : prev));
        return () =>
          setEvents((prev) => (!prev || prev.some((e) => e.id === event.id) ? prev : reinsertAt(prev, event, index)));
      },
      commit: () => fetchJson(`/api/events/${event.slug}`, { method: "DELETE" }),
      errorLabel: `Couldn't delete "${event.title}"`,
    });
  };

  useEffect(() => {
    load();
    // Runs once on mount; showToast is stable for the provider's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-refreshes the whole grid on any event/RSVP change -- a new card
  // appearing, a title/publish-state edit, or a guest count changing (via
  // the stats modal or the guest's own submission) all broadcast
  // `db-changed` with kind "events" (see src/lib/ws-broadcast.ts and its
  // call sites) and should be reflected here without a manual reload.
  useEffect(() => {
    if (!dbChanged || dbChanged.kind !== "events") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbChanged]);

  return (
    <div>
      <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[var(--color-text-primary)] mb-6">
        Pick Up Where You Left Off
      </h1>

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

      {events === null && !error && (
        <p className="text-sm text-[var(--color-text-muted)]">Loading your invitations...</p>
      )}

      {events !== null && events.length === 0 && (
        <p className="text-sm text-[var(--color-text-muted)]">
          You haven&apos;t created any invitations yet. Click &ldquo;New Invitation&rdquo; to get started.
        </p>
      )}

      {events !== null && events.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {events.map((event, index) => (
              <InvitationCard key={event.id} event={event} onDelete={() => deleteEvent(event, index)} />
            ))}
          </div>
          {nextOffset !== null && (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => {
                setLoadingMore(true);
                load(nextOffset, true);
              }}
              className="mt-6 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-2)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function InvitationCard({ event, onDelete }: { event: SenderEventSummary; onDelete: () => void }) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const [arrowHovered, setArrowHovered] = useState(false);
  const [statsHovered, setStatsHovered] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [copyHovered, setCopyHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleteHovered, setDeleteHovered] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const arrowRef = useRef<HTMLSpanElement>(null);
  const statsRef = useRef<HTMLButtonElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);

  const goToEditor = () => router.push(`/e/${event.slug}`);

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!event.published) return;
    const url = `${window.location.origin}/receiver/${event.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be denied on plain-HTTP LAN origins; no fallback
      // needed here specifically since this is a same-origin dev/prod HTTPS
      // app, matching CopyableValue's own primary path.
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={goToEditor}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goToEditor();
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setArrowHovered(false);
        setStatsHovered(false);
        setCopyHovered(false);
        setDeleteHovered(false);
      }}
      aria-label={`Continue editing ${event.title}`}
      className="group relative aspect-[3/4] w-full cursor-pointer overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-lavender)]"
    >
      {event.card_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-uploaded/stored data URLs, not an optimizable static asset
        <img
          src={event.card_image_url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-surface-2)]">
          <FileImage className="h-10 w-10 text-[var(--color-text-muted)]" strokeWidth={1.5} />
        </div>
      )}

      {/* Two stacked gradient layers instead of switching one element's
          background between two different linear-gradient values -- CSS
          can't interpolate between two gradients, so that swap used to just
          hard-cut with no fade. The base layer is always visible; the
          hover layer crossfades in on top of it via opacity, which CSS can
          animate. */}
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
      <div
        className={`absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none transition-opacity duration-200 ${
          hovered ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* This layer sits visually above the card's own whole-card click
          handler (z-10) so the title text and action buttons remain their
          own hit-targets -- see handleCopyLink/onClick below, each of which
          stops propagation so clicking a button doesn't also navigate. */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-2 p-3 pt-10">
        {/* min-w-0 is what makes `truncate` produce an ellipsis here. A flex
            item with overflow:hidden gets an automatic minimum size of zero,
            so once the action buttons claim their space on a narrow card the
            title collapsed to width 0 and the invitation showed no name at
            all -- the same flexbox trap already fixed in the Access DB
            tables. flex-1 lets it claim whatever room is left. */}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white" title={event.title}>
          {event.title}
        </span>
        <span className="flex flex-shrink-0 items-center gap-1.5">
          <button
            type="button"
            ref={deleteRef}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // Shift-click skips the confirm modal, same shortcut the
              // stats breakdown's own row-delete and the admin tables use.
              if (e.shiftKey) onDelete();
              else setConfirmingDelete(true);
            }}
            onMouseEnter={() => setDeleteHovered(true)}
            onMouseLeave={() => setDeleteHovered(false)}
            aria-label={`Delete ${event.title}`}
            className={`flex h-8 w-8 items-center justify-center rounded-full bg-white text-[var(--color-danger)] transition-opacity duration-200 ${
              hovered ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <Trash2 className="h-4 w-4" strokeWidth={2.5} />
          </button>
          {event.published && (
            <button
              type="button"
              ref={copyRef}
              onClick={handleCopyLink}
              onMouseEnter={() => setCopyHovered(true)}
              onMouseLeave={() => setCopyHovered(false)}
              aria-label={`Copy receiver link for ${event.title}`}
              className={`flex h-8 w-8 items-center justify-center rounded-full bg-white text-black transition-opacity duration-200 ${
                hovered ? "opacity-100" : "opacity-0 pointer-events-none"
              }`}
            >
              {copied ? (
                <Check className="h-4 w-4 text-[var(--color-success)]" strokeWidth={2.5} />
              ) : (
                <Link2 className="h-4 w-4" strokeWidth={2.5} />
              )}
            </button>
          )}
          <button
            type="button"
            ref={statsRef}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setStatsOpen(true);
            }}
            onMouseEnter={() => setStatsHovered(true)}
            onMouseLeave={() => setStatsHovered(false)}
            aria-label={`View statistics for ${event.title}`}
            className={`flex h-8 w-8 items-center justify-center rounded-full bg-white text-black transition-opacity duration-200 ${
              hovered ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <ChartPie className="h-4 w-4" strokeWidth={2.5} />
          </button>
          <span
            ref={arrowRef}
            onMouseEnter={() => setArrowHovered(true)}
            onMouseLeave={() => setArrowHovered(false)}
            className={`flex h-8 w-8 items-center justify-center rounded-full bg-white text-black transition-opacity duration-200 ${
              hovered ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </span>
        </span>
      </div>

      <HoverButtonTooltip anchorRef={arrowRef} open={arrowHovered} label="Continue" />
      <HoverButtonTooltip anchorRef={statsRef} open={statsHovered} label="Statistics" />
      <HoverButtonTooltip anchorRef={copyRef} open={copyHovered} label={copied ? "Copied!" : "Copy Link"} />
      <HoverButtonTooltip
        anchorRef={deleteRef}
        open={deleteHovered}
        label="Delete (shift-click to skip confirm)"
      />

      <StatsModal event={event} isOpen={statsOpen} onClose={() => setStatsOpen(false)} />

      <Modal
        isOpen={confirmingDelete}
        title="Delete this invitation?"
        onClose={() => setConfirmingDelete(false)}
        danger
      >
        <p className="text-sm text-[var(--color-text-muted)]">
          This permanently deletes &ldquo;{event.title}&rdquo; and every RSVP submitted to it. This can&apos;t be
          undone.
        </p>
        <ModalActions
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false);
            onDelete();
          }}
          confirmLabel="Delete"
          danger
        />
      </Modal>
    </div>
  );
}

/**
 * A portal-rendered tooltip, positioned from its anchor's own screen
 * coordinates. The card wrapper needs `overflow-hidden` to clip the cover
 * image and gradient to its rounded corners -- an in-flow tooltip anchored
 * inside that card gets clipped along with everything else, so this escapes
 * to document.body instead of using the shared (non-portal) ThemedTooltip.
 * Fade timing is driven by useDropdownReveal, the same hook ThemedTooltip
 * itself uses (e.g. the theme-toggle button's "Toggle theme" popup) -- this
 * keeps every hover popover in the app on one shared reveal/dismiss
 * animation instead of some popping in instantly and some fading.
 * `open` reflects hover on the anchor itself (not the whole card) so the
 * tooltip only appears once that specific button is moused over, matching a
 * normal tooltip's scope. Shared by both the Continue and Statistics
 * buttons rather than duplicating the same positioning logic per label.
 */
function HoverButtonTooltip({
  anchorRef,
  open,
  label,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  label: string;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const { shouldRender, animationClass } = useDropdownReveal(open);

  useEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setPos({ top: rect.bottom + 8, left: rect.left + rect.width / 2 });
  }, [anchorRef, open]);

  if (!shouldRender || !pos) return null;

  return createPortal(
    // The horizontal centering has to live on a wrapper that never animates.
    // dropdown-reveal-in/-out (shared with every other hover popover, e.g.
    // ThemedTooltip) only keyframes translateY/scaleY -- but a CSS animation
    // on `transform` overrides an inline `transform` on that SAME element
    // for its whole duration, not just the properties the keyframes
    // mention. Putting `translateX(-50%)` inline directly on the animated
    // element meant it was ignored for the entire reveal (rendering
    // unshifted, i.e. offset right) and only "snapped" into the centered
    // position once the animation finished and the inline style regained
    // control. Splitting them onto separate elements lets both apply at
    // once instead of one clobbering the other.
    <div style={{ position: "fixed", top: pos.top, left: pos.left, transform: "translateX(-50%)" }}>
      <div
        role="tooltip"
        className={`z-50 whitespace-nowrap rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-1)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-primary)] shadow-lg pointer-events-none ${animationClass}`}
      >
        {label}
      </div>
    </div>,
    document.body,
  );
}

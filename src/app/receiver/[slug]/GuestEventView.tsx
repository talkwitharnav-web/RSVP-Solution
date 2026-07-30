"use client";

import { useEffect, useState } from "react";
import { useWebSocket } from "@/lib/useWebSocket";
import type { PublicEventRecord } from "@/lib/public-event";
import { DEFAULT_DESIGN_COLORS } from "@/lib/design-types";
import { FabricCanvas } from "@/components/design/FabricCanvas";
import RsvpForm from "./RsvpForm";

// Defense in depth alongside the server-side check in POST /api/events --
// only ever render an external RSVP link if it's actually http(s), so a
// pre-existing bad value (from before that check existed, or a direct DB
// edit) can't execute as javascript: in a guest's browser on click.
function isSafeExternalUrl(url: string | null): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The plain guest-facing view -- no owner chrome, no edit affordances.
 * Subscribes to the same `db-changed` broadcast the Access DB page uses
 * (see SYSTEM_MEMORY.md's WebSockets section) so a guest who has the page
 * open while the host is editing it (see EventEditor) sees the update
 * within about a second instead of needing a manual refresh.
 */
export default function GuestEventView({ initialEvent }: { initialEvent: PublicEventRecord }) {
  const [event, setEvent] = useState(initialEvent);
  const { messagesByType } = useWebSocket();
  const dbChanged = messagesByType["db-changed"];

  useEffect(() => {
    if (!dbChanged || dbChanged.kind !== "events") return;
    if (dbChanged.slug && dbChanged.slug !== initialEvent.slug) return;
    fetch(`/api/events/${initialEvent.slug}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((updated) => {
        if (updated) setEvent(updated);
      })
      .catch(() => {
        // A missed live-refresh isn't worth surfacing to a guest -- the page
        // just keeps showing what it last successfully loaded.
      });
  }, [dbChanged, initialEvent.slug]);

  return (
    // A fluid max-width (clamp between a phone-sized floor and a roomier
    // desktop ceiling) instead of one fixed max-w-md -- the page reads as
    // cramped on a real desktop viewport otherwise. Vertical rhythm and
    // heading size scale with clamp() too, so this "just fits" from a small
    // phone up through a wide monitor without a pile of breakpoint classes.
    <main
      className="mx-auto flex w-full flex-1 flex-col justify-center gap-6 sm:gap-8 px-6 py-16"
      style={{ maxWidth: "clamp(24rem, 60vw, 40rem)" }}
    >
      {event.kind === "designed_template" && event.design_config ? (
        <div
          className="mx-auto flex w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] shadow-lg"
          style={{
            // Fills the page's own fluid column rather than being pinned to a
            // fixed 28rem, which left a card designed at 1000px rendering
            // noticeably small on a desktop viewport.
            aspectRatio: `${event.design_config.canvasWidth} / ${event.design_config.canvasHeight}`,
          }}
        >
          {/* Read-only: same fabric.Canvas + same canvasJSON as the editor,
              interaction disabled -- guarantees the guest sees pixel-identical
              content to what the sender designed, never a re-derived render. */}
          <FabricCanvas
            canvasWidth={event.design_config.canvasWidth}
            canvasHeight={event.design_config.canvasHeight}
            initialJSON={event.design_config.canvasJSON}
            backgroundColor={event.design_config.colors?.background ?? DEFAULT_DESIGN_COLORS.background}
            fontPairId={event.design_config.fontPairId}
            readOnly
            className="h-full w-full"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <h1
            className="font-display font-semibold text-[var(--color-text-primary)]"
            style={{ fontSize: "clamp(1.75rem, 1.3rem + 1.5vw, 2.75rem)" }}
          >
            {event.title}
          </h1>
          {event.host_name && (
            <p className="text-base text-[var(--color-text-muted)]">Hosted by {event.host_name}</p>
          )}
          {event.description && <p className="text-base text-[var(--color-text-primary)]">{event.description}</p>}
          {event.event_date && (
            <p className="text-base text-[var(--color-text-muted)]">{new Date(event.event_date).toLocaleString()}</p>
          )}
          {event.location && <p className="text-base text-[var(--color-text-muted)]">{event.location}</p>}
        </div>
      )}

      {event.kind === "custom_card" && event.card_image_url && (
        // eslint-disable-next-line @next/next/no-img-element -- user-uploaded data URL, not an optimizable static asset
        <img
          src={event.card_image_url}
          alt={`${event.title} invitation`}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)]"
        />
      )}

      {event.kind === "external_link" ? (
        isSafeExternalUrl(event.external_url) ? (
          <a
            href={event.external_url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-[var(--radius-full)] bg-[var(--color-accent-coral-text)] px-6 py-3.5 text-center text-base font-semibold text-[var(--color-on-coral)] transition-opacity hover:opacity-90"
          >
            RSVP now
          </a>
        ) : (
          <p className="text-center text-sm text-[var(--color-danger)]">
            This invitation&apos;s RSVP link isn&apos;t valid — please contact the host.
          </p>
        )
      ) : (
        <RsvpForm
          // Keying on the category list forces a clean remount (fresh
          // categoryCounts state) if a live db-changed update swaps the
          // host's guest_categories out from under a guest already filling
          // this out -- without it, RsvpForm's per-category count state
          // could silently retain stale keys instead of matching the
          // newly-rendered inputs one-for-one.
          key={event.guest_categories.join(",")}
          slug={event.slug}
          questions={event.questions}
          guestCategories={event.guest_categories}
        />
      )}
    </main>
  );
}

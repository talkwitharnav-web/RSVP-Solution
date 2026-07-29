"use client";

import { useEffect, useRef, useState } from "react";
import { useDropdownReveal } from "@/lib/useDropdownReveal";
import type { HealthTier } from "@/app/api/health/route";

// sizeBytes/imageStorageBytes/pool/ws are only returned to localhost callers
// -- /api/health is unauthenticated (the pill renders on public pages) and
// the app binds to the LAN, so those internals are withheld off-machine.
type HealthResponse = {
  tier: HealthTier;
  db: {
    connected: boolean;
    latencyMs: number | null;
    sizeBytes?: number | null;
    imageStorageBytes?: number | null;
    pool?: { total: number; idle: number; waiting: number } | null;
  };
  ws?: { connectedClients: number | null };
};

// K/M/G/T, not KB/MB/GB/TB. Binary (1024-based) units, since that's what
// Postgres's own pg_database_size() and every disk-usage tool actually
// measures in.
function formatBytes(bytes: number): string {
  const units = ["B", "K", "M", "G", "T"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  const precision = unitIndex === 0 ? 0 : value < 10 ? 1 : 0;
  return `${value.toFixed(precision)}${units[unitIndex]}`;
}

const TIER_CONFIG: Record<HealthTier, { label: string; dot: string; text: string }> = {
  healthy: { label: "Healthy", dot: "bg-[var(--color-success)]", text: "text-[var(--color-success)]" },
  ok: { label: "OK", dot: "bg-[var(--color-accent-coral-text)]", text: "text-[var(--color-accent-coral-text)]" },
  bad: { label: "Bad", dot: "bg-[var(--color-danger)]", text: "text-[var(--color-danger)]" },
  terrible: { label: "Terrible", dot: "bg-[var(--color-danger)] animate-pulse", text: "text-[var(--color-danger)]" },
};

// The client's own round-trip to /api/health includes the caller's network
// hop (their wifi, their ISP) on top of the server's own DB-latency number --
// this is what lets the pin reflect "your internet is bad" even when the
// server and DB are both perfectly healthy.
//
// These were originally tighter, which turned out to be too tight: ordinary
// browser/OS jitter (a GC pause, Docker Desktop overhead, the tab having
// been backgrounded) routinely pushes even a healthy same-LAN round-trip
// past a tight threshold, which made the pill flicker between healthy/ok on
// a perfectly fine connection. Loosened to thresholds that only trip on
// latency a real user would actually notice.
const CLIENT_LATENCY_OK_MS = 400;
const CLIENT_LATENCY_BAD_MS = 1500;

const POLL_INTERVAL_MS = 10000;
// While the popover is actually open (hovered on desktop, tapped on touch),
// the user is looking right at these numbers -- poll much faster so they
// read as close to live. Reverts to the standard cadence the instant it
// closes, rather than staying fast in the background.
const POLL_INTERVAL_ACTIVE_MS = 1500;

function worseTier(a: HealthTier, b: HealthTier): HealthTier {
  const order: HealthTier[] = ["healthy", "ok", "bad", "terrible"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

function clientTierFromLatency(ms: number): HealthTier {
  if (ms > CLIENT_LATENCY_BAD_MS) return "bad";
  if (ms > CLIENT_LATENCY_OK_MS) return "ok";
  return "healthy";
}

/**
 * Polls GET /api/health and shows a small status pin summarizing DB
 * latency/pool saturation, live WS listener count, and the caller's own
 * round-trip time to the server (so a caller with bad wifi sees a degraded
 * pin even if the server itself is fine). Polling pauses when the tab is
 * backgrounded.
 *
 * `showDbSize` additionally renders the DB's total on-disk size (K/M/G/T,
 * human-readable) inline in the pill itself -- opt-in, passed from
 * admin/db, since disk usage isn't something worth showing on every page,
 * but is directly relevant on the page that manages the DB.
 *
 * `detailLevel` controls how much the popover reveals: "full" (admin/db)
 * shows everything including pool stats and live listener count; "basic"
 * (the default everywhere else, incl. the sender dashboard) shows only
 * connection + DB latency -- pool/listener internals aren't meaningful to a
 * non-admin audience.
 */
export function HealthPin({
  showDbSize = false,
  detailLevel = "basic",
}: { showDbSize?: boolean; detailLevel?: "basic" | "full" } = {}) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [clientLatencyMs, setClientLatencyMs] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [tapped, setTapped] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Hover alone (onMouseEnter/onMouseLeave) doesn't reliably work on touch
  // devices -- there's no mouse, so the detail popover would be unreachable
  // on a phone/tablet. A tap toggles a separate `tapped` state (independent
  // of hover, which still works for desktop mouse users), closed by tapping
  // anywhere outside -- same outside-click pattern as AccessibilityMenu.
  useEffect(() => {
    if (!tapped) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setTapped(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [tapped]);

  const isActive = hovering || tapped;
  const { shouldRender: showPopover, animationClass: popoverAnimationClass } = useDropdownReveal(isActive);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      const started = performance.now();
      try {
        const res = await fetch("/api/health");
        if (!res.ok) throw new Error(`Health check failed with status ${res.status}`);
        const data: HealthResponse = await res.json();
        const elapsed = performance.now() - started;
        if (!cancelled) {
          setHealth(data);
          setClientLatencyMs(Math.round(elapsed));
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    // Fetch immediately whenever the active state flips on, so opening the
    // popover shows a fresh reading rather than waiting for the next tick of
    // whichever interval was already running. Debounced (not fired
    // synchronously) so rapidly flicking the cursor on/off the pin -- which
    // re-runs this effect on every single hover toggle -- can't spam an
    // immediate request per toggle; only a toggle that actually settles for
    // a moment triggers one. A real hover/tap that stays active long enough
    // to read the popover always still gets its fresh reading within 250ms.
    const immediate = setTimeout(poll, 250);
    const interval = setInterval(poll, isActive ? POLL_INTERVAL_ACTIVE_MS : POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(immediate);
      clearInterval(interval);
    };
  }, [isActive]);

  const tier: HealthTier = failed
    ? "terrible"
    : health && clientLatencyMs !== null
      ? worseTier(health.tier, clientTierFromLatency(clientLatencyMs))
      : (health?.tier ?? "ok");
  const config = TIER_CONFIG[tier];

  return (
    <div
      ref={containerRef}
      className="relative flex items-center gap-1.5 px-2.5 h-8 rounded-[var(--radius-sm)] text-xs font-medium cursor-pointer"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={() => setTapped((t) => !t)}
      role="button"
      tabIndex={0}
      aria-label="Server health details"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setTapped((t) => !t);
        }
      }}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 animate-health-pulse ${config.dot}`} />
      <span className={`${config.text} whitespace-nowrap`}>{config.label}</span>
      {showDbSize && health?.db.sizeBytes != null && (
        <span className="text-[var(--color-text-muted)] whitespace-nowrap">· {formatBytes(health.db.sizeBytes)}</span>
      )}

      {showPopover && (
        <div className={`${popoverAnimationClass} absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-1)] shadow-lg p-4 text-xs text-[var(--color-text-muted)] z-30`}>
          {failed ? (
            <p className="text-[var(--color-danger)]">Health check request failed — server may be unreachable.</p>
          ) : health ? (
            <dl className="space-y-1.5">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--color-text-muted)]">Your connection</dt>
                <dd className="text-[var(--color-text-primary)] font-medium">
                  {clientLatencyMs !== null ? `${clientLatencyMs}ms` : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--color-text-muted)]">Database</dt>
                <dd className="text-[var(--color-text-primary)] font-medium">
                  {health.db.connected ? `${health.db.latencyMs}ms` : "disconnected"}
                </dd>
              </div>
              {showDbSize && health.db.sizeBytes != null && (
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-text-muted)]">DB size</dt>
                  <dd className="text-[var(--color-text-primary)] font-medium">{formatBytes(health.db.sizeBytes)}</dd>
                </div>
              )}
              {showDbSize && health.db.imageStorageBytes != null && (
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-text-muted)]">Image storage</dt>
                  <dd className="text-[var(--color-text-primary)] font-medium">
                    {formatBytes(health.db.imageStorageBytes)}
                  </dd>
                </div>
              )}
              {detailLevel === "full" && health.db.pool && (
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-text-muted)]">DB pool</dt>
                  <dd className="text-[var(--color-text-primary)] font-medium">
                    {health.db.pool.idle}/{health.db.pool.total} idle
                    {health.db.pool.waiting > 0 ? `, ${health.db.pool.waiting} waiting` : ""}
                  </dd>
                </div>
              )}
              {detailLevel === "full" && health.ws?.connectedClients != null && (
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-text-muted)]">Live listeners</dt>
                  <dd className="text-[var(--color-text-primary)] font-medium">{health.ws.connectedClients}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p>Checking server health…</p>
          )}
        </div>
      )}
    </div>
  );
}

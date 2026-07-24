"use client";

import { useDropdownReveal } from "@/lib/useDropdownReveal";
import { useWebSocket } from "@/lib/useWebSocket";
import { useRef, useState, useEffect } from "react";

type Tier = "healthy" | "connecting" | "offline";

const TIER_CONFIG: Record<Tier, { label: string; dot: string; text: string }> = {
  healthy: { label: "Healthy", dot: "bg-[var(--color-success)]", text: "text-[var(--color-success)]" },
  connecting: { label: "Connecting", dot: "bg-[var(--color-accent-coral-text)]", text: "text-[var(--color-text-muted)]" },
  offline: { label: "Offline", dot: "bg-[var(--color-danger)]", text: "text-[var(--color-danger)]" },
};

/**
 * Live status pin fed by the server's own WebSocket heartbeat (see
 * server.js's HEARTBEAT_INTERVAL_MS broadcast) -- no client-side polling.
 * Only shows connection status for now, since RSVP has no /api/health-style
 * endpoint yet (DB latency, pool stats, etc. are future work once there's
 * a real reason to surface them).
 */
export function HealthPin() {
  const { status, messagesByType } = useWebSocket();
  const [hovering, setHovering] = useState(false);
  const [tapped, setTapped] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
  const { shouldRender: showPopover, animationClass } = useDropdownReveal(isActive);

  // Date.now() can't be called during render (impure -- would also differ
  // between server and client and trip a hydration mismatch). Only actually
  // needed while the popover is visible, so it's computed in an effect that
  // ticks once a second while showPopover is true, not on every render.
  useEffect(() => {
    if (!showPopover) return;
    // Initial tick for a value that then updates on its own interval below;
    // there's no render-pure way to read the current clock time.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNowMs(Date.now());
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [showPopover]);

  const tier: Tier = status === "open" ? "healthy" : status === "connecting" ? "connecting" : "offline";
  const config = TIER_CONFIG[tier];
  const heartbeat = messagesByType["heartbeat"];
  const lastHeartbeatAt = typeof heartbeat?.at === "number" ? heartbeat.at : null;

  return (
    <div
      ref={containerRef}
      className="relative flex items-center gap-1.5 px-2.5 h-8 rounded-[var(--radius-sm)] text-xs font-medium cursor-pointer"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={() => setTapped((t) => !t)}
      role="button"
      tabIndex={0}
      aria-label="Connection status details"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setTapped((t) => !t);
        }
      }}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 animate-health-pulse ${config.dot}`} />
      <span className={`${config.text} whitespace-nowrap`}>{config.label}</span>

      {showPopover && (
        <div
          className={`${animationClass} absolute right-0 top-full mt-2 w-56 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-1)] shadow-lg p-4 text-xs text-[var(--color-text-muted)] z-30`}
        >
          <dl className="space-y-1.5">
            <div className="flex justify-between gap-3">
              <dt>Live connection</dt>
              <dd className="text-[var(--color-text-primary)] font-medium">
                {status === "open" ? "Connected" : status === "connecting" ? "Connecting…" : "Disconnected"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Last heartbeat</dt>
              <dd className="text-[var(--color-text-primary)] font-medium">
                {lastHeartbeatAt && nowMs
                  ? `${Math.max(0, Math.round((nowMs - lastHeartbeatAt) / 1000))}s ago`
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}

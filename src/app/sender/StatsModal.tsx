"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { X } from "lucide-react";
import { useDropdownReveal } from "@/lib/useDropdownReveal";
import { useWebSocket } from "@/lib/useWebSocket";
import type { EventRecord, RsvpRecord } from "@/lib/types";

/**
 * Categorical palette for the guest-category pie, validated with
 * scripts/validate_palette.js from the dataviz skill against this app's own
 * light (#fdf2f5) and dark (#241827) chart surfaces -- not the skill's
 * generic default palette, since these hues are tuned to RSVP's own
 * coral/lavender/gold family. Only the first 3 slots pass the strict
 * "any two wedges can be neighbors" (all-pairs) CVD/contrast gates a pie
 * chart actually needs -- past 3 categories, per the skill's own guidance,
 * more hues doesn't reliably stay distinguishable, so slot 4+ shares one
 * neutral gray fill and leans entirely on its direct label + legend rather
 * than a hard-to-tell-apart hue. Every slot (including the neutral overflow
 * one) still gets a direct label and appears in the legend, since two
 * hues here (gold, in both modes) sit in the CVD floor band or below
 * chart-surface contrast -- both conditions the skill treats as requiring
 * that same relief, not the "nice to have" default.
 */
const CATEGORY_COLORS_LIGHT = ["#c42e3d", "#69579c", "#b8860b"];
const CATEGORY_COLORS_DARK = ["#d94538", "#9d84cf", "#b98a00"];
const OVERFLOW_COLOR_LIGHT = "#e0becb"; // --color-border-strong
const OVERFLOW_COLOR_DARK = "#5c4364"; // --color-border-strong (dark)

function useIsDarkTheme() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const check = () => {
      const attr = root.getAttribute("data-theme");
      if (attr === "dark") return setIsDark(true);
      if (attr === "light") return setIsDark(false);
      setIsDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", check);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", check);
    };
  }, []);
  return isDark;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load statistics");
  return res.json();
}

type StatsData = { guestCategories: string[]; rsvps: RsvpRecord[] };

type PieTooltipPayload = { payload: { category: string; value: number; color: string } };

/** Themed replacement for recharts' default tooltip box, matching the app's surface/border tokens instead of the library's plain white default. */
function PieSegmentTooltip({ active, payload }: { active?: boolean; payload?: PieTooltipPayload[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const { category, value, color } = payload[0].payload;
  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 text-sm shadow-lg">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      <span className="font-semibold text-[var(--color-text-primary)]">{value}</span>
      <span className="text-[var(--color-text-muted)]">{category}</span>
    </div>
  );
}

export function StatsModal({ event, isOpen, onClose }: { event: EventRecord; isOpen: boolean; onClose: () => void }) {
  const { shouldRender } = useDropdownReveal(isOpen);
  const [data, setData] = useState<StatsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isDark = useIsDarkTheme();
  const { messagesByType } = useWebSocket();
  const dbChanged = messagesByType["db-changed"];

  const load = () => {
    fetchJson<StatsData>(`/api/events/${event.slug}/rsvps/stats`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong"));
  };

  useEffect(() => {
    if (!isOpen) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, event.slug]);

  // Live-refreshes while the modal is open, same db-changed broadcast every
  // other live view in the app subscribes to -- a guest submitting an RSVP
  // while the sender has this open updates the chart without a manual
  // reopen.
  useEffect(() => {
    if (!isOpen || !dbChanged || dbChanged.kind !== "events") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbChanged, isOpen]);

  if (!shouldRender) return null;

  const categories = data?.guestCategories ?? [];
  const attendingRsvps = (data?.rsvps ?? []).filter((r) => r.attending);
  const colors = isDark ? CATEGORY_COLORS_DARK : CATEGORY_COLORS_LIGHT;
  const overflowColor = isDark ? OVERFLOW_COLOR_DARK : OVERFLOW_COLOR_LIGHT;

  const chartData = categories.map((category, i) => ({
    category,
    value: attendingRsvps.reduce((sum, r) => sum + (r.category_counts[category] ?? 0), 0),
    color: i < colors.length ? colors[i] : overflowColor,
  }));
  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  const backdropClass = isOpen ? "modal-backdrop-reveal" : "modal-backdrop-reveal-out";
  const panelClass = isOpen ? "modal-panel-reveal" : "modal-panel-reveal-out";

  return createPortal(
    <div
      className={`fixed inset-0 bg-black/70 modal-backdrop-blur flex justify-center items-center z-50 p-4 ${backdropClass}`}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="stats-modal-title"
        onClick={(e) => e.stopPropagation()}
        className={`bg-[var(--color-surface-1)] border border-[var(--color-border-strong)] rounded-[var(--radius-md)] shadow-xl p-6 w-full max-w-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto ${panelClass}`}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 id="stats-modal-title" className="text-xl font-bold font-display text-[var(--color-text-primary)]">
            {event.title} &mdash; RSVP Statistics
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        {!data && !error && <p className="text-sm text-[var(--color-text-muted)]">Loading...</p>}

        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="flex flex-col items-center">
              {total === 0 ? (
                <p className="py-16 text-sm text-[var(--color-text-muted)]">
                  No attending RSVPs yet -- the chart will fill in as responses come in.
                </p>
              ) : (
                <>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData}
                          dataKey="value"
                          nameKey="category"
                          innerRadius="55%"
                          outerRadius="85%"
                          paddingAngle={2}
                          stroke="var(--color-surface-1)"
                          strokeWidth={2}
                        >
                          {chartData.map((d) => (
                            <Cell key={d.category} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<PieSegmentTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Direct labels + legend, not just chart-hover tooltips --
                      required relief per the dataviz skill for any slot
                      sitting in the CVD floor band or below chart-surface
                      contrast (gold, in both modes here), and also the
                      "table view" fallback for a screen reader or a reader
                      who never hovers. */}
                  <ul className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-sm">
                    {chartData.map((d) => (
                      <li key={d.category} className="flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: d.color }}
                          aria-hidden="true"
                        />
                        <span className="text-[var(--color-text-primary)] font-medium">{d.value}</span>
                        <span className="text-[var(--color-text-muted)]">{d.category}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-3">
                Guest Breakdown
              </h3>
              {attendingRsvps.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)]">No attending RSVPs yet.</p>
              ) : (
                <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {attendingRsvps.map((rsvp) => (
                    <li
                      key={rsvp.id}
                      className="flex flex-col gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-3 py-2.5"
                    >
                      <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                        {rsvp.guest_name}
                      </span>
                      <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-text-muted)]">
                        {categories.map((category) => (
                          <span key={category} className="whitespace-nowrap">
                            <span className="font-semibold text-[var(--color-text-primary)]">
                              {rsvp.category_counts[category] ?? 0}
                            </span>{" "}
                            {category}
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

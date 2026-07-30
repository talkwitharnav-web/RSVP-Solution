"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { TooltipContentProps } from "recharts";
import { X, Trash2 } from "lucide-react";
import { useDropdownReveal } from "@/lib/useDropdownReveal";
import { useWebSocket } from "@/lib/useWebSocket";
import { useOptimisticActions, reinsertAt } from "@/lib/optimistic";
import { categoryLabelForCount } from "@/lib/guest-categories";
import { ThemedTooltip } from "@/components/ui/ThemedTooltip";
import type { RsvpRecord, SenderEventSummary } from "@/lib/types";

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

/**
 * "Can't come" is deliberately a desaturated neutral rather than a fourth
 * hue: it isn't a guest category, it's the absence of one, and the palette
 * above only has three slots that survive the all-pairs CVD/contrast gates.
 * A muted grey also matches how "not attending" reads everywhere else in
 * the app. It carries a direct label in the legend, same as every other
 * slice, so it never depends on colour alone to be identified.
 */
const DECLINED_COLOR_LIGHT = "#6b6259"; // --color-text-muted
const DECLINED_COLOR_DARK = "#b7ada2"; // --color-text-muted (dark)
const DECLINED_LABEL = "Can't come";

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

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Failed to load statistics");
  return json;
}

type StatsData = { guestCategories: string[]; rsvps: RsvpRecord[] };

type PieTooltipPayload = { payload: { label: string; value: number; color: string } };

/**
 * Themed replacement for recharts' default tooltip box, matching the app's
 * surface/border tokens instead of the library's plain white default.
 *
 * The fade-out used to never play: recharts' own `TooltipBoundingBox`
 * wrapper (which this content renders inside of) snaps `visibility: hidden`
 * the instant its `active` prop goes false -- `visibility` can't be eased,
 * so it hard-cuts regardless of any CSS animation class on the content
 * underneath. The fix spans both this component and its parent
 * (`StatsModal`):
 *   - the parent tracks real hover itself via `Pie`'s onMouseEnter/Leave
 *     (`hovering`, instant) and passes a *delayed* copy as an explicit
 *     `active` override on <Tooltip> (`isActive` here) -- recharts documents
 *     `active` as force-showing the tooltip regardless of its own internal
 *     mouse tracking, which is what keeps `visibility: visible` for the
 *     ~150ms this component's own exit animation needs.
 *   - this component switches to the `dropdown-reveal-out` class the moment
 *     `hovering` (the undelayed signal) goes false, so the fade-out starts
 *     immediately and finishes right around when `isActive` finally flips
 *     and the ancestor's `visibility: hidden` would otherwise cut it off.
 */
function PieSegmentTooltip({
  isActive,
  hovering,
  payload,
}: {
  isActive?: boolean;
  hovering: boolean;
  payload?: PieTooltipPayload[];
}) {
  const current = payload && payload.length > 0 ? payload[0].payload : null;
  // Adjusting state during render (React's documented pattern for deriving
  // state from a prop change, not an effect) rather than in a useEffect --
  // an effect would fire a render, THEN a second cascading render to apply
  // it, which is one extra frame of the old segment's data showing during
  // the exit fade. Guarded so it only fires on a genuine change, not every
  // render.
  const [lastShown, setLastShown] = useState(current);
  if (current && current !== lastShown) setLastShown(current);
  const shown = current ?? lastShown;

  if (!isActive || !shown) return null;
  const animationClass = hovering ? "dropdown-reveal" : "dropdown-reveal-out";

  const { label, value, color } = shown;
  return (
    <div
      className={`${animationClass} flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 text-sm shadow-lg`}
    >
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      <span className="font-semibold text-[var(--color-text-primary)]">{value}</span>
      <span className="text-[var(--color-text-muted)]">{label}</span>
    </div>
  );
}

export function StatsModal({ event, isOpen, onClose }: { event: SenderEventSummary; isOpen: boolean; onClose: () => void }) {
  const { shouldRender } = useDropdownReveal(isOpen);
  const [data, setData] = useState<StatsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which row is asking "are you sure?" -- an inline confirm rather than a
  // second Modal, since this view is already a modal and stacking two
  // backdrops means one stray click can close both.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // Tracked ourselves via Pie's own mouse events rather than trusting
  // recharts' internal hover state -- see PieSegmentTooltip's doc comment.
  // `pieHovering` is instant (drives which segment shows); `activeTooltip`
  // lags it by useDropdownReveal's own exit delay and is passed as an
  // explicit `active` override on <Tooltip>, which is what keeps recharts'
  // wrapper visible long enough for the exit fade to actually play.
  const [pieHovering, setPieHovering] = useState(false);
  const { shouldRender: activeTooltip } = useDropdownReveal(pieHovering);
  const isDark = useIsDarkTheme();
  const { messagesByType } = useWebSocket();
  const dbChanged = messagesByType["db-changed"];
  const { run } = useOptimisticActions();

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
    if (dbChanged.slug && dbChanged.slug !== event.slug) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbChanged, isOpen]);

  // A guest can only submit, never edit, so removing a wrong answer is the
  // sender's job. The row disappears immediately and comes back where it
  // was if the server refuses -- see lib/optimistic.ts.
  const deleteRsvp = (rsvp: RsvpRecord, index: number) => {
    setConfirmingId(null);
    void run({
      apply: () => {
        setData((prev) => (prev ? { ...prev, rsvps: prev.rsvps.filter((r) => r.id !== rsvp.id) } : prev));
        return () =>
          setData((prev) =>
            !prev || prev.rsvps.some((r) => r.id === rsvp.id)
              ? prev
              : { ...prev, rsvps: reinsertAt(prev.rsvps, rsvp, index) },
          );
      },
      commit: () => fetchJson(`/api/events/${event.slug}/rsvps/${rsvp.id}`, { method: "DELETE" }),
      errorLabel: `Couldn't remove ${rsvp.guest_name}'s RSVP`,
    });
  };

  if (!shouldRender) return null;

  const categories = data?.guestCategories ?? [];
  const allRsvps = data?.rsvps ?? [];
  const attendingRsvps = allRsvps.filter((r) => r.attending);
  const declinedCount = allRsvps.length - attendingRsvps.length;
  const colors = isDark ? CATEGORY_COLORS_DARK : CATEGORY_COLORS_LIGHT;
  const overflowColor = isDark ? OVERFLOW_COLOR_DARK : OVERFLOW_COLOR_LIGHT;
  const declinedColor = isDark ? DECLINED_COLOR_DARK : DECLINED_COLOR_LIGHT;

  // A decline contributes no guest counts, so it's counted as one person per
  // response -- without its own slice, saying "no" would leave the sender
  // with no evidence anywhere that the guest ever replied.
  // `category` stays the raw key (stable React key + tooltip name); `label`
  // is what's shown, singularised when the count is exactly one.
  const chartData = [
    ...categories.map((category, i) => {
      const value = attendingRsvps.reduce((sum, r) => sum + (r.category_counts[category] ?? 0), 0);
      return {
        category,
        label: categoryLabelForCount(category, value),
        value,
        color: i < colors.length ? colors[i] : overflowColor,
      };
    }),
    { category: DECLINED_LABEL, label: DECLINED_LABEL, value: declinedCount, color: declinedColor },
  ];
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

        {/* The "-open" class is applied unconditionally once mounted -- the
            grid row track itself is what's eased (0fr -> 1fr), so the actual
            smoothing happens automatically on any content-height change
            underneath, with no JS-tracked height value that could go stale.
            See globals.css for why an earlier ResizeObserver-based version
            of this was the cause of a real bug (a stuck-small height +
            overflow:hidden silently clipping the whole card blank). */}
        <div className="stats-modal-height-transition stats-modal-height-transition-open">
          <div>
            {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
            {!data && !error && <p className="text-sm text-[var(--color-text-muted)]">Loading...</p>}

            {data && (
              // key forces a fresh mount (and therefore a fresh
              // stats-content-swap-in fade-in) whenever the view actually
              // switches between the empty and populated layouts -- without
              // it React would just patch the existing DOM in place and the
              // content would appear instantly rather than fading.
              <div key={total === 0 ? "empty" : "populated"} className="stats-content-swap-in">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="flex flex-col items-center">
                    {total === 0 ? (
                      <p className="py-16 text-sm text-[var(--color-text-muted)]">
                        No RSVPs yet -- the chart will fill in as responses come in.
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
                                onMouseEnter={() => setPieHovering(true)}
                                onMouseLeave={() => setPieHovering(false)}
                              >
                                {chartData.map((d) => (
                                  <Cell key={d.category} fill={d.color} />
                                ))}
                              </Pie>
                              {/* isAnimationActive={false} on purpose -- recharts
                                  by default eases the tooltip's position from the
                                  chart's (0,0) origin to the cursor on every
                                  hover, which reads as the popup "flying in" from
                                  the top-left corner each time. Disabling it snaps
                                  the tooltip straight to the correct spot; the pie
                                  slices themselves are unaffected, that's a
                                  separate animation.
                                  `active={activeTooltip}` is an explicit override
                                  (recharts keeps a force-active tooltip visible
                                  regardless of its own internal state) -- it lags
                                  real hover by the exit-fade's own delay so
                                  PieSegmentTooltip's dropdown-reveal-out has time
                                  to actually play before recharts' wrapper would
                                  otherwise hard-cut it via `visibility: hidden`.
                                  `content` is a render function (not a bare
                                  element) so `hovering` -- our own instant signal,
                                  not one recharts knows about -- can ride along
                                  next to the `payload` recharts injects. */}
                              <Tooltip
                                content={(props: TooltipContentProps) => {
                                  // recharts' own payload entries carry lots of
                                  // chart-internal fields we don't need -- pull
                                  // out just what PieSegmentTooltip actually uses,
                                  // sourced from each Cell's own data object.
                                  const first = props.payload?.[0]?.payload as
                                    | { label: string; value: number; color: string }
                                    | undefined;
                                  return (
                                    <PieSegmentTooltip
                                      isActive={activeTooltip}
                                      hovering={pieHovering}
                                      payload={first ? [{ payload: first }] : undefined}
                                    />
                                  );
                                }}
                                isAnimationActive={false}
                                active={activeTooltip}
                              />
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
                              <span className="text-[var(--color-text-muted)]">{d.label}</span>
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
                    {allRsvps.length === 0 ? (
                      <p className="text-sm text-[var(--color-text-muted)]">No RSVPs yet.</p>
                    ) : (
                      <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {allRsvps.map((rsvp, index) => (
                          <li
                            key={rsvp.id}
                            className="flex flex-col gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-3 py-2.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                                {rsvp.guest_name}
                              </span>
                              {confirmingId === rsvp.id ? (
                                <span className="flex shrink-0 items-center gap-2 text-xs">
                                  <span className="text-[var(--color-text-muted)]">Remove?</span>
                                  <button
                                    type="button"
                                    onClick={() => deleteRsvp(rsvp, index)}
                                    className="font-semibold text-[var(--color-danger)] hover:underline"
                                  >
                                    Yes
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmingId(null)}
                                    className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </span>
                              ) : (
                                <ThemedTooltip label="Remove this RSVP (shift-click to skip the confirm)">
                                  <button
                                    type="button"
                                    aria-label={`Remove ${rsvp.guest_name}'s RSVP`}
                                    // Shift-click skips the confirm, same shortcut
                                    // the admin tables already use for deletes.
                                    onClick={(e) =>
                                      e.shiftKey ? deleteRsvp(rsvp, index) : setConfirmingId(rsvp.id)
                                    }
                                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-1)] hover:text-[var(--color-danger)] transition-colors"
                                  >
                                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                                  </button>
                                </ThemedTooltip>
                              )}
                            </div>
                            {rsvp.attending ? (
                              <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-text-muted)]">
                                {categories.map((category) => {
                                  const count = rsvp.category_counts[category] ?? 0;
                                  return (
                                    <span key={category} className="whitespace-nowrap">
                                      <span className="font-semibold text-[var(--color-text-primary)]">
                                        {count}
                                      </span>{" "}
                                      {categoryLabelForCount(category, count)}
                                    </span>
                                  );
                                })}
                              </span>
                            ) : (
                              // Same swatch colour as the pie's own slice, so the
                              // two halves of this view read as one thing.
                              <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: declinedColor }}
                                  aria-hidden="true"
                                />
                                {DECLINED_LABEL}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

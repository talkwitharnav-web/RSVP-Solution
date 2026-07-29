"use client";

import {
  createContext,
  FC,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { CheckCircle2, XCircle, TriangleAlert, X } from "lucide-react";

/**
 * macOS-style notification stack, mounted once in the root layout so any
 * screen in the app can raise one.
 *
 * The *behaviour* is modelled on the reference project's own notification
 * group -- newest on top, collapsed pile with a count badge, click to
 * expand, auto-dismiss paused while expanded, exit animation before removal.
 * The *look* is not: its cards use the translucent "Bistro Glaze" surface,
 * and this app is deliberately flat, so these are solid single-colour fills
 * on the same tokens Button.tsx uses. Also left out: error-code chips and
 * the action-button variant, which only mean something in that app.
 */

type ToastType = "success" | "error" | "warning";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  durationMs: number;
  removing?: boolean;
}

type ShowToast = (message: string, type: ToastType) => void;

// Failures stay on screen longer than confirmations -- a success is
// something you already expected, a failure is something you have to read.
const AUTO_DISMISS_MS: Record<ToastType, number> = {
  success: 4000,
  warning: 6000,
  error: 8000,
};
const REMOVE_ANIMATION_MS = 250;
// How many cards are visible in the collapsed pile before it's just a
// count. Three reads as a "stack" without becoming clutter.
const COLLAPSED_STACK_DEPTH = 3;

const ToastContext = createContext<ShowToast | null>(null);

// Flat solid fills, same token pairs the buttons use -- no gradient, blur
// or translucency anywhere.
const TYPE_STYLE: Record<ToastType, string> = {
  success: "bg-[var(--color-success)] text-[var(--color-on-sage)]",
  warning: "bg-[var(--color-accent-coral)] text-[var(--color-on-coral)]",
  error: "bg-[var(--color-danger)] text-[var(--color-on-danger)]",
};

let nextId = 1;

const ToastCard: FC<{
  item: ToastItem;
  onDismiss: () => void;
}> = ({ item, onDismiss }) => (
  <div
    data-toast-type={item.type}
    role={item.type === "error" ? "alert" : "status"}
    aria-atomic="true"
    className={`flex items-center gap-3 rounded-[var(--radius-sm)] p-4 w-80 max-w-[90vw] shadow-lg ${TYPE_STYLE[item.type]} ${
      item.removing ? "animate-notification-pop-out" : "animate-notification-pop-in"
    }`}
  >
    {item.type === "success" ? (
      <CheckCircle2 className="w-5 h-5 shrink-0" strokeWidth={2.25} />
    ) : item.type === "warning" ? (
      <TriangleAlert className="w-5 h-5 shrink-0" strokeWidth={2.25} />
    ) : (
      <XCircle className="w-5 h-5 shrink-0" strokeWidth={2.25} />
    )}
    <span className="flex-1 text-sm leading-snug break-words">{item.message}</span>
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onDismiss();
      }}
      className="shrink-0 opacity-80 hover:opacity-100 transition-opacity"
      aria-label="Dismiss notification"
    >
      <X className="w-4 h-4" />
    </button>
  </div>
);

export const ToastProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const timeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const removeImmediately = useCallback((id: number) => {
    const t = timeoutsRef.current.get(id);
    if (t) clearTimeout(t);
    timeoutsRef.current.delete(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const startAutoDismiss = useCallback(
    (id: number, durationMs: number) => {
      const existing = timeoutsRef.current.get(id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        // Play the exit animation first, then drop it from state.
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, removing: true } : i)));
        setTimeout(() => removeImmediately(id), REMOVE_ANIMATION_MS);
      }, durationMs);
      timeoutsRef.current.set(id, timer);
    },
    [removeImmediately],
  );

  const showToast = useCallback<ShowToast>(
    (message, type) => {
      const id = nextId++;
      const durationMs = AUTO_DISMISS_MS[type];
      setItems((prev) => [...prev, { id, message, type, durationMs }]);
      // While the group is open the user is reading it -- don't yank cards
      // out from under them. Same rule macOS applies.
      if (!expanded) startAutoDismiss(id, durationMs);
    },
    [expanded, startAutoDismiss],
  );

  // Expanding pauses every timer; collapsing restarts the ones that are
  // missing.
  useEffect(() => {
    if (expanded) {
      timeoutsRef.current.forEach((t) => clearTimeout(t));
      timeoutsRef.current.clear();
      return;
    }
    items.forEach((item) => {
      if (!timeoutsRef.current.has(item.id) && !item.removing) {
        startAutoDismiss(item.id, item.durationMs);
      }
    });
    // Keyed on the expand/collapse transition only -- adding `items` would
    // restart every timer each time a new notification arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      timeouts.forEach((t) => clearTimeout(t));
    };
  }, []);

  const dismissOne = useCallback(
    (id: number) => {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, removing: true } : i)));
      setTimeout(() => {
        removeImmediately(id);
        // Nothing left to expand once the group is down to one.
        setItems((prev) => {
          if (prev.length <= 1) setExpanded(false);
          return prev;
        });
      }, REMOVE_ANIMATION_MS);
    },
    [removeImmediately],
  );

  const dismissAll = useCallback(() => {
    setItems((prev) => prev.map((i) => ({ ...i, removing: true })));
    setTimeout(() => {
      timeoutsRef.current.forEach((t) => clearTimeout(t));
      timeoutsRef.current.clear();
      setItems([]);
      setExpanded(false);
    }, REMOVE_ANIMATION_MS);
  }, []);

  const activeCount = items.length;

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {activeCount > 0 && (
        <div className="toast-stack fixed z-[60] flex flex-col items-end max-w-[calc(100vw-2rem)]">
          {expanded || activeCount === 1 ? (
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <ToastCard key={item.id} item={item} onDismiss={() => dismissOne(item.id)} />
              ))}
              {activeCount > 1 && (
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="self-end mt-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                >
                  Collapse
                </button>
              )}
            </div>
          ) : (
            <div
              className="relative w-80 max-w-full cursor-pointer"
              style={{ height: 78 }}
              role="button"
              tabIndex={0}
              aria-label={`${activeCount} notifications, activate to expand`}
              onClick={() => setExpanded(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpanded(true);
                }
              }}
            >
              {items
                .slice(-COLLAPSED_STACK_DEPTH)
                .reverse()
                .map((item, depth) => (
                  // Two elements on purpose: the wrapper owns the stack's
                  // position/scale, the card owns the pop animation. A CSS
                  // animation overrides an inline transform (and
                  // `animation-fill-mode: both` keeps overriding it after it
                  // ends), so putting both on one element silently flattens
                  // the pile -- the same trap ThemedTooltip hit.
                  <div
                    key={item.id}
                    style={{
                      position: "absolute",
                      top: depth * 8,
                      left: 0,
                      right: 0,
                      transform: `scale(${1 - depth * 0.05})`,
                      zIndex: 10 - depth,
                      opacity: depth === 0 ? 1 : 0.7 - depth * 0.15,
                    }}
                  >
                    {/* In the collapsed pile the "x" clears the whole group,
                        not just whichever card happens to be on top. */}
                    <ToastCard item={item} onDismiss={dismissAll} />
                  </div>
                ))}
              <span className="absolute -top-2 -right-2 z-20 flex h-5 min-w-5 items-center justify-center rounded-[var(--radius-full)] bg-[var(--color-accent-coral)] px-1.5 text-xs font-bold text-[var(--color-on-coral)]">
                {activeCount}
              </span>
            </div>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
};

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

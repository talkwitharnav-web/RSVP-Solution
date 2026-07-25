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

type ToastType = "success" | "error" | "warning";
interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  removing?: boolean;
}

type ShowToast = (message: string, type: ToastType) => void;

const AUTO_DISMISS_MS = 4000;
const REMOVE_ANIMATION_MS = 250;

const ToastContext = createContext<ShowToast | null>(null);

const TYPE_STYLE: Record<ToastType, string> = {
  success: "bg-[var(--color-success)] text-[var(--color-bg-base)]",
  warning: "bg-[var(--color-accent-coral)] text-[var(--color-on-coral)]",
  error: "bg-[var(--color-danger)] text-white",
};

const ToastCard: FC<{ item: ToastItem; onDismiss: () => void }> = ({ item, onDismiss }) => (
  <div
    role={item.type === "error" ? "alert" : "status"}
    aria-atomic="true"
    className={`flex items-center gap-3 rounded-[var(--radius-sm)] p-4 w-80 max-w-[90vw] shadow-lg ${TYPE_STYLE[item.type]} ${
      item.removing ? "animate-notification-pop-out" : "animate-notification-pop-in"
    }`}
  >
    {item.type === "success" ? (
      <CheckCircle2 className="w-5 h-5 shrink-0" />
    ) : item.type === "warning" ? (
      <TriangleAlert className="w-5 h-5 shrink-0" />
    ) : (
      <XCircle className="w-5 h-5 shrink-0" />
    )}
    <span className="flex-1 text-sm">{item.message}</span>
    <button
      onClick={onDismiss}
      className="shrink-0 opacity-80 hover:opacity-100 transition-opacity"
      aria-label="Dismiss notification"
    >
      <X className="w-4 h-4" />
    </button>
  </div>
);

let nextId = 1;

export const ToastProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const removeImmediately = useCallback((id: number) => {
    const t = timeoutsRef.current.get(id);
    if (t) clearTimeout(t);
    timeoutsRef.current.delete(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const dismissOne = useCallback(
    (id: number) => {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, removing: true } : i)));
      setTimeout(() => removeImmediately(id), REMOVE_ANIMATION_MS);
    },
    [removeImmediately],
  );

  const showToast = useCallback<ShowToast>(
    (message, type) => {
      const id = nextId++;
      setItems((prev) => [...prev, { id, message, type }]);
      const timer = setTimeout(() => dismissOne(id), AUTO_DISMISS_MS);
      timeoutsRef.current.set(id, timer);
    },
    [dismissOne],
  );

  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      timeouts.forEach((t) => clearTimeout(t));
    };
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {items.length > 0 && (
        <div className="fixed right-4 top-4 z-50 flex flex-col gap-2 items-end max-w-[calc(100vw-2rem)]">
          {items.map((item) => (
            <ToastCard key={item.id} item={item} onDismiss={() => dismissOne(item.id)} />
          ))}
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

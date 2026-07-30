"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Database,
  Trash2,
  Key,
  ShieldAlert,
  Search,
  Pencil,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  FilterX,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { CopyableValue } from "@/components/ui/CopyableValue";
import { ThemedTooltip } from "@/components/ui/ThemedTooltip";
import { StrengthMeter } from "@/components/ui/StrengthMeter";
import { scorePasswordStrength } from "@/lib/credential-strength";
import { useWebSocket } from "@/lib/useWebSocket";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { useOptimisticActions, reinsertAt } from "@/lib/optimistic";
import type { AdminEventSummary, UserRecord, EventKind } from "@/lib/types";

// Single source of truth for RSVP kind display labels -- shared by the badge
// and the filter dropdown so they can never drift apart (previously the
// badge itself had a two-way ternary that silently mislabeled both
// custom_card and designed_template as "Hosted Template").
const EVENT_KIND_LABELS: Record<EventKind, string> = {
  external_link: "External Link",
  custom_card: "Custom Card",
  designed_template: "Designed Template",
};

type SortDirection = "asc" | "desc";
interface SortState<K extends string> {
  key: K | null;
  direction: SortDirection;
}
const NO_SORT = { key: null, direction: "asc" as SortDirection };

// asc -> desc -> unsorted, back to insertion order on the third click.
function cycleSort<K extends string>(state: SortState<K>, key: K): SortState<K> {
  if (state.key !== key) return { key, direction: "asc" };
  if (state.direction === "asc") return { key, direction: "desc" };
  return { key: null, direction: "asc" };
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function compareChronological(a: string, b: string): number {
  return new Date(a).getTime() - new Date(b).getTime();
}

function SortIcon({ direction }: { direction: SortDirection | null }) {
  if (direction === "asc") return <ArrowUp size={14} />;
  if (direction === "desc") return <ArrowDown size={14} />;
  return <ArrowUpDown size={14} className="opacity-50" />;
}

// A <th> whose entire cell is a real <button>, so sorting is reachable by
// keyboard, not just click -- and aria-sort reflects the live state for
// screen readers.
function SortableTh({
  label,
  active,
  direction,
  onClick,
  className = "",
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  className?: string;
}) {
  return (
    <th
      scope="col"
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={`text-left text-[var(--color-text-muted)] font-medium ${className}`}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1.5 w-full py-3 px-4 hover:text-[var(--color-text-primary)] transition-colors"
      >
        {label}
        <SortIcon direction={active ? direction : null} />
      </button>
    </th>
  );
}

// Caps a long value at maxWidthClass and truncates with an ellipsis instead
// of letting it stretch the table (see the overflow bug this fixes), while
// still surfacing the full value on hover via the app's own tooltip instead
// of the native `title` attribute.
function TruncatedText({ value, maxWidthClass = "max-w-[220px]" }: { value: string; maxWidthClass?: string }) {
  return (
    <ThemedTooltip label={value} className={`${maxWidthClass} min-w-0`}>
      <span className="truncate">{value}</span>
    </ThemedTooltip>
  );
}

// Same truncation guarantee as TruncatedText, but keeps the click-to-copy
// affordance CopyableValue already provides for the real (untruncated) value.
function TruncatedCopyable({
  value,
  label,
  maxWidthClass = "max-w-[220px]",
  monospace = false,
}: {
  value: string;
  label: string;
  maxWidthClass?: string;
  monospace?: boolean;
}) {
  return (
    <ThemedTooltip label={value} className={`${maxWidthClass} min-w-0`}>
      <CopyableValue
        value={value}
        label={label}
        className={`max-w-full min-w-0 ${monospace ? "font-mono text-xs" : ""}`}
      />
    </ThemedTooltip>
  );
}

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  danger: boolean;
  onConfirm: () => void;
  confirmationPhrase?: string;
}

const EMPTY_CONFIRM: ConfirmState = {
  isOpen: false,
  title: "",
  message: "",
  danger: false,
  onConfirm: () => {},
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed with status ${res.status}`);
  return json;
}

type AdminDbResponse = {
  users: UserRecord[];
  events: AdminEventSummary[];
  nextUserOffset: number | null;
  nextEventOffset: number | null;
};

function AdminDbContent() {
  const router = useRouter();
  const showToast = useToast();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [events, setEvents] = useState<AdminEventSummary[]>([]);
  const [nextUserOffset, setNextUserOffset] = useState<number | null>(null);
  const [nextEventOffset, setNextEventOffset] = useState<number | null>(null);
  const [loadingMoreTable, setLoadingMoreTable] = useState<"users" | "events" | null>(null);
  const [blockedInfiniteScroll, setBlockedInfiniteScroll] = useState({ users: false, events: false });
  const [isLoading, setIsLoading] = useState(true);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [eventSearch, setEventSearch] = useState("");
  const [confirmState, setConfirmState] = useState<ConfirmState>(EMPTY_CONFIRM);
  const [confirmationInput, setConfirmationInput] = useState("");
  const [passwordResetTarget, setPasswordResetTarget] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string; username: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [userSort, setUserSort] = useState<SortState<"name" | "username">>(NO_SORT);
  const [kindFilter, setKindFilter] = useState<EventKind | "all">("all");
  const [eventSort, setEventSort] = useState<SortState<"title" | "kind" | "created_at">>(NO_SORT);

  // Client-side prediction: row changes land in the table immediately and
  // are rolled back only if the server refuses them. See lib/optimistic.ts.
  const { run, pendingCount, hasPending, pendingRef } = useOptimisticActions();
  // Set when a db-changed push arrives mid-flight and had to be ignored, so
  // the deferred refetch still happens once everything is confirmed.
  const missedRefreshRef = useRef(false);
  const loadingMoreTableRef = useRef<"users" | "events" | null>(null);
  const userScrollRootRef = useRef<HTMLDivElement>(null);
  const eventScrollRootRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    const data = await fetchJson<AdminDbResponse>("/api/dev/db");
    setUsers(data.users);
    setEvents(data.events);
    setNextUserOffset(data.nextUserOffset);
    setNextEventOffset(data.nextEventOffset);
    setBlockedInfiniteScroll({ users: false, events: false });
  }, []);

  const loadMore = async (table: "users" | "events") => {
    const offset = table === "users" ? nextUserOffset : nextEventOffset;
    if (offset === null || loadingMoreTableRef.current) return;
    loadingMoreTableRef.current = table;
    setLoadingMoreTable(table);
    try {
      const offsetKey = table === "users" ? "userOffset" : "eventOffset";
      const data = await fetchJson<AdminDbResponse>(`/api/dev/db?table=${table}&${offsetKey}=${offset}`);
      if (table === "users") {
        setUsers((previous) => {
          const ids = new Set(previous.map((user) => user.id));
          return [...previous, ...data.users.filter((user) => !ids.has(user.id))];
        });
        setNextUserOffset(data.nextUserOffset);
      } else {
        setEvents((previous) => {
          const ids = new Set(previous.map((event) => event.id));
          return [...previous, ...data.events.filter((event) => !ids.has(event.id))];
        });
        setNextEventOffset(data.nextEventOffset);
      }
      setBlockedInfiniteScroll((previous) => ({ ...previous, [table]: false }));
    } catch (error) {
      setBlockedInfiniteScroll((previous) => ({ ...previous, [table]: true }));
      showToast(error instanceof Error ? error.message : "Couldn't continue loading this table", "error");
    } finally {
      loadingMoreTableRef.current = null;
      setLoadingMoreTable(null);
    }
  };

  const userInfiniteScrollRef = useInfiniteScroll({
    enabled: nextUserOffset !== null && !blockedInfiniteScroll.users,
    loading: loadingMoreTable !== null,
    onLoadMore: () => void loadMore("users"),
    rootRef: userScrollRootRef,
    rootMargin: "240px 0px",
  });
  const eventInfiniteScrollRef = useInfiniteScroll({
    enabled: nextEventOffset !== null && !blockedInfiniteScroll.events,
    loading: loadingMoreTable !== null,
    onLoadMore: () => void loadMore("events"),
    rootRef: eventScrollRootRef,
    rootMargin: "240px 0px",
  });

  useEffect(() => {
    fetchJson<{ authenticated: boolean; admin: boolean }>("/api/session")
      .then((session) => {
        if (session.admin) {
          setIsAdminAuthenticated(true);
        } else {
          router.push("/");
        }
      })
      .catch(() => router.push("/"))
      .finally(() => setIsSessionLoading(false));
  }, [router]);

  useEffect(() => {
    if (!isAdminAuthenticated) return;
    // Initial data fetch on mount -- unavoidable without diverging from SSR,
    // same documented precedent as HealthPin/AccessibilityMenu elsewhere in
    // this project (see SYSTEM_MEMORY.md).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload().finally(() => setIsLoading(false));
  }, [reload, isAdminAuthenticated]);

  useEffect(() => {
    const resumeInfiniteScroll = () => setBlockedInfiniteScroll({ users: false, events: false });
    window.addEventListener("online", resumeInfiniteScroll);
    return () => window.removeEventListener("online", resumeInfiniteScroll);
  }, []);

  // Live updates: any API route that inserts/updates/deletes a users or
  // events row calls broadcastDbChanged() (see lib/ws-broadcast.ts), which
  // pushes a "db-changed" message over the same /ws connection HealthPin's
  // listener count already tracks. A user signing up on another tab/device
  // shows up here within the same tick, no polling or manual refresh.
  const { messagesByType } = useWebSocket();
  const dbChangedMessage = messagesByType["db-changed"];
  useEffect(() => {
    if (!isAdminAuthenticated || !dbChangedMessage) return;
    // A refetch while one of our own mutations is still unconfirmed would
    // overwrite the predicted state with server data that predates it --
    // the deleted row would flash back into the table and then vanish
    // again. Defer it to the effect below instead.
    if (pendingRef.current > 0) {
      missedRefreshRef.current = true;
      return;
    }
    // Reacting to an external system's own update (a WS push from another
    // client's mutation), not synchronizing from React's own state -- same
    // documented exception as HealthPin/AccessibilityMenu elsewhere in this
    // project (see SYSTEM_MEMORY.md).
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbChangedMessage, isAdminAuthenticated]);

  // Everything we predicted is now confirmed (or rolled back) -- safe to
  // take the server's word for the whole table again.
  useEffect(() => {
    if (pendingCount > 0 || !missedRefreshRef.current) return;
    missedRefreshRef.current = false;
    // Reconciling with the server after our own in-flight writes settled.
    void reload();
  }, [pendingCount, reload]);

  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    const matches = users.filter(
      (u) => u.name.toLowerCase().includes(term) || u.username.toLowerCase().includes(term),
    );
    if (!userSort.key) return matches;
    const key = userSort.key;
    const sorted = [...matches].sort((a, b) => compareText(a[key], b[key]));
    return userSort.direction === "asc" ? sorted : sorted.reverse();
  }, [users, userSearch, userSort]);

  const filteredEvents = useMemo(() => {
    const term = eventSearch.trim().toLowerCase();
    const matches = events.filter(
      (e) => e.title.toLowerCase().includes(term) && (kindFilter === "all" || e.kind === kindFilter),
    );
    if (!eventSort.key) return matches;
    const key = eventSort.key;
    const sorted = [...matches].sort((a, b) => {
      if (key === "created_at") return compareChronological(a.created_at, b.created_at);
      if (key === "kind") return compareText(EVENT_KIND_LABELS[a.kind], EVENT_KIND_LABELS[b.kind]);
      return compareText(a.title, b.title);
    });
    return eventSort.direction === "asc" ? sorted : sorted.reverse();
  }, [events, eventSearch, kindFilter, eventSort]);

  if (isSessionLoading || !isAdminAuthenticated) return null;

  const closeConfirm = () => {
    setConfirmState(EMPTY_CONFIRM);
    setConfirmationInput("");
  };

  const performAction = async (action: () => Promise<unknown>, successMessage: string) => {
    closeConfirm();
    try {
      await action();
      showToast(successMessage, "success");
      void reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "An unknown error occurred", "error");
    }
  };

  const handleSeed = () => {
    setConfirmState({
      isOpen: true,
      title: "Seed Database",
      message: "This clears existing data, then creates 3 sample users and 3 sample RSVP links. Every sample user uses password123.",
      danger: false,
      confirmationPhrase: "SEED DATABASE",
      onConfirm: () =>
        performAction(
          () => fetchJson("/api/dev/db", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "seed" }),
          }),
          "Seeded 3 users and 3 sample RSVP links!",
        ),
    });
  };

  const handlePurge = () => {
    setConfirmState({
      isOpen: true,
      title: "Purge Database",
      message: "Are you sure you want to purge the database? THIS ACTION IS IRREVERSIBLE.",
      danger: true,
      confirmationPhrase: "PURGE DATABASE",
      onConfirm: () =>
        performAction(
          () => fetchJson("/api/dev/db", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ confirmation: "PURGE DATABASE" }),
          }),
          "Database purged successfully!",
        ),
    });
  };

  // The row disappears the instant you click, and comes back in its original
  // position if the server refuses -- no spinner, no waiting on a round trip.
  const handleDeleteUser = (id: string, name: string, skipConfirm: boolean) => {
    const doDelete = () => {
      closeConfirm();
      const index = users.findIndex((u) => u.id === id);
      const removed = users[index];
      if (!removed) return;
      void run({
        apply: () => {
          setUsers((prev) => prev.filter((u) => u.id !== id));
          return () =>
            setUsers((prev) => (prev.some((u) => u.id === id) ? prev : reinsertAt(prev, removed, index)));
        },
        commit: () => fetchJson(`/api/users/${id}`, { method: "DELETE" }),
        errorLabel: `Couldn't delete ${name}`,
        onConfirmed: () => showToast("User deleted successfully!", "success"),
      });
    };
    if (skipConfirm) {
      doDelete();
      return;
    }
    setConfirmState({
      isOpen: true,
      title: "Delete user",
      message: `Are you sure you want to delete ${name}? This cannot be undone.`,
      danger: true,
      onConfirm: doDelete,
    });
  };

  const handleDeleteEvent = (slug: string, title: string, skipConfirm: boolean) => {
    const doDelete = () => {
      closeConfirm();
      const index = events.findIndex((e) => e.slug === slug);
      const removed = events[index];
      if (!removed) return;
      void run({
        apply: () => {
          setEvents((prev) => prev.filter((e) => e.slug !== slug));
          return () =>
            setEvents((prev) => (prev.some((e) => e.slug === slug) ? prev : reinsertAt(prev, removed, index)));
        },
        commit: () => fetchJson(`/api/events/${slug}`, { method: "DELETE" }),
        errorLabel: `Couldn't delete "${title}"`,
        onConfirmed: () => showToast("RSVP link deleted successfully!", "success"),
      });
    };
    if (skipConfirm) {
      doDelete();
      return;
    }
    setConfirmState({
      isOpen: true,
      title: "Delete RSVP link",
      message: `Are you sure you want to delete "${title}"? This cannot be undone.`,
      danger: true,
      onConfirm: doDelete,
    });
  };

  const handlePasswordReset = () => {
    const target = passwordResetTarget;
    const password = newPassword;
    if (!target) return;
    const previousRaw = users.find((u) => u.id === target)?.raw_password ?? null;
    void run({
      apply: () => {
        // The dev-mirror column is exactly what we just sent, so it can be
        // predicted; the bcrypt hash can't be, and reconciles on confirm.
        setUsers((prev) => prev.map((u) => (u.id === target ? { ...u, raw_password: password } : u)));
        setNewPassword("");
        setPasswordResetTarget(null);
        return () => {
          setUsers((prev) => prev.map((u) => (u.id === target ? { ...u, raw_password: previousRaw } : u)));
          setNewPassword(password);
          setPasswordResetTarget(target);
        };
      },
      commit: () =>
        fetchJson(`/api/users/${target}/password`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPassword: password }),
        }),
      errorLabel: "Couldn't update password",
      onConfirmed: () => {
        showToast("Password updated successfully!", "success");
        // Pull the real hash once every in-flight change has settled.
        missedRefreshRef.current = true;
      },
    });
  };

  const handleRename = () => {
    const target = renameTarget;
    const name = newName;
    const username = newUsername;
    if (!target) return;
    void run({
      apply: () => {
        setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, name, username } : u)));
        setRenameTarget(null);
        return () => {
          setUsers((prev) =>
            prev.map((u) => (u.id === target.id ? { ...u, name: target.name, username: target.username } : u)),
          );
          setNewName(name);
          setNewUsername(username);
          setRenameTarget(target);
        };
      },
      commit: () =>
        fetchJson(`/api/users/${target.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, username }),
        }),
      errorLabel: `Couldn't rename ${target.name}`,
      onConfirmed: () => showToast("User renamed successfully!", "success"),
    });
  };

  const userFiltersActive = userSearch !== "" || userSort.key !== null;
  const eventFiltersActive = eventSearch !== "" || kindFilter !== "all" || eventSort.key !== null;

  const clearUserFilters = () => {
    setUserSearch("");
    setUserSort(NO_SORT);
  };

  const clearEventFilters = () => {
    setEventSearch("");
    setKindFilter("all");
    setEventSort(NO_SORT);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-dvh text-[var(--color-text-muted)]">
        Loading...
      </div>
    );
  }

  return (
    <>
      <Modal isOpen={confirmState.isOpen} title={confirmState.title} onClose={closeConfirm} danger={confirmState.danger}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!confirmState.confirmationPhrase || confirmationInput === confirmState.confirmationPhrase) {
              confirmState.onConfirm();
            }
          }}
        >
          <p className="text-[var(--color-text-muted)] mb-6">{confirmState.message}</p>
          {confirmState.confirmationPhrase && (
            <div className="mb-2">
              <label htmlFor="destructive-confirmation" className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                Type <strong>{confirmState.confirmationPhrase}</strong> to continue
              </label>
              <Input
                id="destructive-confirmation"
                type="text"
                value={confirmationInput}
                onChange={(event) => setConfirmationInput(event.target.value)}
                autoComplete="off"
              />
            </div>
          )}
          <ModalActions
            onCancel={closeConfirm}
            onConfirm={confirmState.onConfirm}
            danger={confirmState.danger}
            confirmLabel="Confirm"
            confirmDisabled={
              !!confirmState.confirmationPhrase && confirmationInput !== confirmState.confirmationPhrase
            }
            submit
          />
        </form>
      </Modal>

      <Modal
        isOpen={passwordResetTarget !== null}
        title="Change Password"
        onClose={() => {
          setPasswordResetTarget(null);
          setNewPassword("");
        }}
      >
        <Input
          type="text"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Enter new password"
          className="mb-2"
        />
        <StrengthMeter {...scorePasswordStrength(newPassword)} empty={newPassword.length === 0} />
        <ModalActions
          onCancel={() => {
            setPasswordResetTarget(null);
            setNewPassword("");
          }}
          onConfirm={handlePasswordReset}
          confirmLabel="Update Password"
        />
      </Modal>

      <Modal
        isOpen={renameTarget !== null}
        title="Edit User"
        onClose={() => setRenameTarget(null)}
      >
        <label htmlFor="edit-user-name" className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
          Name
        </label>
        <Input
          id="edit-user-name"
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Enter name"
          className="mb-4"
        />
        <label htmlFor="edit-user-username" className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
          Username
        </label>
        <Input
          id="edit-user-username"
          type="text"
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          placeholder="Enter username"
          className="mb-2"
        />
        <ModalActions
          onCancel={() => setRenameTarget(null)}
          onConfirm={handleRename}
          confirmLabel="Save"
        />
      </Modal>

      <div className="h-dvh flex flex-col overflow-hidden p-4 sm:p-8">
        <div className="shrink-0">
          <PageHeader
            title="Access DB"
            backHref="/"
            noClearTopRight
            actions={
              <>
                {/* The tables already show the result of an action; this is
                    the only hint that it hasn't been confirmed yet. */}
                {hasPending && (
                  <span
                    role="status"
                    className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]"
                  >
                    <Loader2 size={14} className="animate-spin" />
                    Syncing...
                  </span>
                )}
                <Button variant="secondary" onClick={handleSeed}>
                  <Database size={16} />
                  Seed Database
                </Button>
                {/* Fixed gap from the collapsed settings pill (which sits at
                    top-4 right-4, ~2.5rem wide) -- a static margin, not
                    clear-top-right's live-resizing reserve, so this never
                    grows/shrinks as the pill expands; it only needs to clear
                    the pill's collapsed resting state. */}
                <Button variant="danger" onClick={handlePurge} className="mr-14">
                  <ShieldAlert size={16} />
                  Purge Database
                </Button>
              </>
            }
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto relative z-0">
          <section className="mb-10">
            <div className="flex flex-wrap items-center justify-between mb-3 gap-3">
              <h2 className="font-display text-lg font-semibold text-[var(--color-text-primary)]">Users</h2>
              {/* No flex-wrap here: a `w-full` search box demanded the whole
                  row, which bumped Clear filters onto a second line where it
                  floated in dead space between the search box and the table.
                  A definite width keeps the controls together as one row. */}
              <div className="flex items-center gap-2">
                <div className="relative w-72">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
                  <Input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search users..."
                    aria-label="Search users"
                    className="pl-9"
                  />
                </div>
                <Button variant="ghost" onClick={clearUserFilters} disabled={!userFiltersActive}>
                  <FilterX size={16} />
                  Clear filters
                </Button>
              </div>
            </div>
            <Card className="!p-0 overflow-hidden max-h-[40vh] flex flex-col">
              <div ref={userScrollRootRef} className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
                <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-[var(--color-surface-1)] z-20 shadow-[0_1px_0_var(--color-border)]">
                  <tr className="border-b border-[var(--color-border)]">
                    <SortableTh
                      label="Name"
                      active={userSort.key === "name"}
                      direction={userSort.direction}
                      onClick={() => setUserSort((s) => cycleSort(s, "name"))}
                    />
                    <SortableTh
                      label="Username"
                      active={userSort.key === "username"}
                      direction={userSort.direction}
                      onClick={() => setUserSort((s) => cycleSort(s, "username"))}
                    />
                    <th
                      scope="col"
                      className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium hidden lg:table-cell"
                    >
                      Hashed Password
                    </th>
                    <th
                      scope="col"
                      className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium hidden md:table-cell"
                    >
                      Raw Password
                    </th>
                    <th className="sticky right-0 py-3 px-4 text-right text-[var(--color-text-muted)] font-medium bg-[var(--color-surface-1)] z-10">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 px-4 text-center text-[var(--color-text-muted)]">
                        {users.length === 0 ? "No users yet." : "No users match your search."}
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => (
                      <tr key={u.id} className="border-b border-[var(--color-border)] last:border-0">
                        <td className="py-3 px-4 text-[var(--color-text-primary)] font-medium">
                          <TruncatedCopyable value={u.name} label="name" maxWidthClass="max-w-[140px] sm:max-w-[220px]" />
                        </td>
                        <td className="py-3 px-4 text-[var(--color-text-muted)]">
                          <TruncatedCopyable
                            value={u.username}
                            label="username"
                            maxWidthClass="max-w-[140px] sm:max-w-[200px]"
                          />
                        </td>
                        <td className="py-3 px-4 text-[var(--color-text-muted)] hidden lg:table-cell">
                          <TruncatedCopyable value={u.password} label="hashed password" monospace maxWidthClass="max-w-[200px]" />
                        </td>
                        <td className="py-3 px-4 text-[var(--color-text-muted)] hidden md:table-cell">
                          {u.raw_password && (
                            <TruncatedCopyable
                              value={u.raw_password}
                              label="raw password"
                              monospace
                              maxWidthClass="max-w-[160px]"
                            />
                          )}
                        </td>
                        <td className="sticky right-0 py-3 px-4 text-right bg-[var(--color-surface-1)] z-10">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => {
                                setRenameTarget({ id: u.id, name: u.name, username: u.username });
                                setNewName(u.name);
                                setNewUsername(u.username);
                              }}
                              aria-label={`Edit ${u.name}`}
                              className="p-2 bg-[var(--color-surface-2)] hover:opacity-80 text-[var(--color-text-primary)] border border-[var(--color-border-strong)] rounded-[var(--radius-sm)] transition-colors"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() => setPasswordResetTarget(u.id)}
                              aria-label={`Reset password for ${u.name}`}
                              className="p-2 bg-[var(--color-accent-coral-text)] hover:opacity-90 text-[var(--color-on-coral)] rounded-[var(--radius-sm)] transition-colors"
                            >
                              <Key size={16} />
                            </button>
                            <button
                              onClick={(e) => handleDeleteUser(u.id, u.name, e.shiftKey)}
                              title="Hold Shift to skip the confirmation"
                              aria-label={`Delete ${u.name}`}
                              className="p-2 bg-[var(--color-danger)] hover:opacity-90 text-white rounded-[var(--radius-sm)] transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                </table>
                {nextUserOffset !== null && !blockedInfiniteScroll.users && (
                  <div ref={userInfiniteScrollRef} role="status" aria-live="polite" className="flex h-10 items-center justify-center">
                    {loadingMoreTable === "users" && (
                      <Loader2 size={18} className="animate-spin text-[var(--color-text-muted)]" aria-hidden />
                    )}
                    <span className="sr-only">{loadingMoreTable === "users" ? "Loading more users" : ""}</span>
                  </div>
                )}
              </div>
            </Card>
          </section>

          <section>
            <div className="flex flex-wrap items-center justify-between mb-3 gap-3">
              <h2 className="font-display text-lg font-semibold text-[var(--color-text-primary)]">RSVP Links</h2>
              <div className="flex items-center gap-2">
                <div className="relative w-72">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
                  <Input
                    type="text"
                    value={eventSearch}
                    onChange={(e) => setEventSearch(e.target.value)}
                    placeholder="Search RSVP links..."
                    aria-label="Search RSVP links"
                    className="pl-9"
                  />
                </div>
                <select
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value as EventKind | "all")}
                  aria-label="Filter by kind"
                  className="px-3 py-2.5 text-sm bg-[var(--color-surface-0)] text-[var(--color-text-primary)] border border-[var(--color-border-strong)] rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-coral-text)] focus:border-[var(--color-accent-coral-text)] transition-colors"
                >
                  <option value="all">All kinds</option>
                  {(Object.entries(EVENT_KIND_LABELS) as [EventKind, string][]).map(([kind, label]) => (
                    <option key={kind} value={kind}>
                      {label}
                    </option>
                  ))}
                </select>
                <Button variant="ghost" onClick={clearEventFilters} disabled={!eventFiltersActive}>
                  <FilterX size={16} />
                  Clear filters
                </Button>
              </div>
            </div>
            <Card className="!p-0 overflow-hidden max-h-[55vh] flex flex-col relative">
              <div ref={eventScrollRootRef} className="overflow-x-auto overflow-y-auto flex-1">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-[var(--color-surface-1)] z-20 shadow-[0_1px_0_var(--color-border)]">
                    <tr className="border-b border-[var(--color-border)]">
                      <SortableTh
                        label="Title"
                        active={eventSort.key === "title"}
                        direction={eventSort.direction}
                        onClick={() => setEventSort((s) => cycleSort(s, "title"))}
                      />
                      <SortableTh
                        label="Kind"
                        active={eventSort.key === "kind"}
                        direction={eventSort.direction}
                        onClick={() => setEventSort((s) => cycleSort(s, "kind"))}
                      />
                      <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">
                        Link
                      </th>
                      <SortableTh
                        label="Created At"
                        active={eventSort.key === "created_at"}
                        direction={eventSort.direction}
                        onClick={() => setEventSort((s) => cycleSort(s, "created_at"))}
                        className="hidden md:table-cell"
                      />
                      <th className="sticky right-0 py-3 px-4 text-right text-[var(--color-text-muted)] font-medium bg-[var(--color-surface-1)] z-10">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvents.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 px-4 text-center text-[var(--color-text-muted)]">
                          {events.length === 0 ? "No RSVP links yet." : "No RSVP links match your filters."}
                        </td>
                      </tr>
                    ) : (
                      filteredEvents.map((e) => (
                        <tr key={e.id} className="border-b border-[var(--color-border)] last:border-0">
                          <td className="py-3 px-4 text-[var(--color-text-primary)] font-medium">
                            <TruncatedText value={e.title} maxWidthClass="max-w-[180px] sm:max-w-[280px]" />
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-xs font-medium px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]">
                              {EVENT_KIND_LABELS[e.kind]}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[var(--color-text-muted)]">
                            {typeof window !== "undefined" && (
                              <TruncatedCopyable
                                value={`${window.location.origin}/receiver/${e.slug}`}
                                label="RSVP link"
                                monospace
                                maxWidthClass="max-w-[220px]"
                              />
                            )}
                          </td>
                          <td className="py-3 px-4 text-[var(--color-text-primary)] hidden md:table-cell">
                            {new Date(e.created_at).toLocaleString()}
                          </td>
                          <td className="sticky right-0 py-3 px-4 text-right bg-[var(--color-surface-1)] z-10">
                            <button
                              onClick={(ev) => handleDeleteEvent(e.slug, e.title, ev.shiftKey)}
                              title="Hold Shift to skip the confirmation"
                              aria-label={`Delete ${e.title}`}
                              className="p-2 bg-[var(--color-danger)] hover:opacity-90 text-white rounded-[var(--radius-sm)] transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                {nextEventOffset !== null && !blockedInfiniteScroll.events && (
                  <div ref={eventInfiniteScrollRef} role="status" aria-live="polite" className="flex h-10 items-center justify-center">
                    {loadingMoreTable === "events" && (
                      <Loader2 size={18} className="animate-spin text-[var(--color-text-muted)]" aria-hidden />
                    )}
                    <span className="sr-only">{loadingMoreTable === "events" ? "Loading more RSVP links" : ""}</span>
                  </div>
                )}
              </div>
            </Card>
          </section>
        </div>
      </div>
    </>
  );
}

export default function AdminDbPage() {
  return <AdminDbContent />;
}

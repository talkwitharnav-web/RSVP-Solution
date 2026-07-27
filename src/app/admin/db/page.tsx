"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Database, Trash2, Key, ShieldAlert, Search, Pencil } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { SettingsToggles } from "@/components/ui/SettingsToggles";
import { HealthPin } from "@/components/ui/HealthPin";
import { CopyableValue } from "@/components/ui/CopyableValue";
import { StrengthMeter } from "@/components/ui/StrengthMeter";
import { scorePasswordStrength } from "@/lib/credential-strength";
import { useWebSocket } from "@/lib/useWebSocket";
import type { UserRecord, EventRecord } from "@/lib/types";

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

function AdminDbContent() {
  const router = useRouter();
  const showToast = useToast();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
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

  const reload = useCallback(async () => {
    const data = await fetchJson<{ users: UserRecord[]; events: EventRecord[] }>("/api/dev/db");
    setUsers(data.users);
    setEvents(data.events);
  }, []);

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

  // Live updates: any API route that inserts/updates/deletes a users or
  // events row calls broadcastDbChanged() (see lib/ws-broadcast.ts), which
  // pushes a "db-changed" message over the same /ws connection HealthPin's
  // listener count already tracks. A user signing up on another tab/device
  // shows up here within the same tick, no polling or manual refresh.
  const { messagesByType } = useWebSocket();
  const dbChangedMessage = messagesByType["db-changed"];
  useEffect(() => {
    if (!isAdminAuthenticated || !dbChangedMessage) return;
    // Reacting to an external system's own update (a WS push from another
    // client's mutation), not synchronizing from React's own state -- same
    // documented exception as HealthPin/AccessibilityMenu elsewhere in this
    // project (see SYSTEM_MEMORY.md).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbChangedMessage, isAdminAuthenticated]);

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

  const handleDeleteUser = (id: string, name: string, skipConfirm: boolean) => {
    const doDelete = () =>
      performAction(
        () => fetchJson(`/api/users/${id}`, { method: "DELETE" }),
        "User deleted successfully!",
      );
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
    const doDelete = () =>
      performAction(
        () => fetchJson(`/api/events/${slug}`, { method: "DELETE" }),
        "RSVP link deleted successfully!",
      );
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

  const handlePasswordReset = async () => {
    if (!passwordResetTarget) return;
    try {
      await fetchJson(`/api/users/${passwordResetTarget}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      showToast("Password updated successfully!", "success");
      setNewPassword("");
      setPasswordResetTarget(null);
      void reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "An unknown error occurred", "error");
    }
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    try {
      await fetchJson(`/api/users/${renameTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, username: newUsername }),
      });
      showToast("User renamed successfully!", "success");
      setRenameTarget(null);
      void reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "An unknown error occurred", "error");
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.trim().toLowerCase()) ||
      u.username.toLowerCase().includes(userSearch.trim().toLowerCase()),
  );
  const filteredEvents = events.filter((e) =>
    e.title.toLowerCase().includes(eventSearch.trim().toLowerCase()),
  );

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
        <SettingsToggles health={<HealthPin showDbSize />} />
        <div className="shrink-0">
          <PageHeader
            title="Access DB"
            backHref="/"
            noClearTopRight
            actions={
              <>
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
            <div className="flex items-center justify-between mb-3 gap-4">
              <h2 className="font-display text-lg font-semibold text-[var(--color-text-primary)]">Users</h2>
              <div className="relative w-full max-w-xs">
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
            </div>
            <Card className="!p-0 overflow-x-auto max-h-[40vh] overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-[var(--color-surface-1)] z-20 shadow-[0_1px_0_var(--color-border)]">
                  <tr className="border-b border-[var(--color-border)]">
                    <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">
                      Name
                    </th>
                    <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">
                      Username
                    </th>
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
                        No users match your search.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => (
                      <tr key={u.id} className="border-b border-[var(--color-border)] last:border-0">
                        <td className="py-3 px-4 text-[var(--color-text-primary)] font-medium">
                          <CopyableValue value={u.name} label="name" />
                        </td>
                        <td className="py-3 px-4 text-[var(--color-text-muted)]">
                          <CopyableValue value={u.username} label="username" />
                        </td>
                        <td className="py-3 px-4 text-[var(--color-text-muted)] font-mono text-xs break-all hidden lg:table-cell">
                          <CopyableValue value={u.password} label="hashed password" />
                        </td>
                        <td className="py-3 px-4 text-[var(--color-text-muted)] font-mono text-xs hidden md:table-cell">
                          {u.raw_password && <CopyableValue value={u.raw_password} label="raw password" />}
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
            </Card>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3 gap-4">
              <h2 className="font-display text-lg font-semibold text-[var(--color-text-primary)]">RSVP Links</h2>
              <div className="relative w-full max-w-xs">
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
            </div>
            <Card className="!p-0 overflow-hidden max-h-[55vh] flex flex-col relative">
              <div className="overflow-x-auto overflow-y-auto flex-1">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-[var(--color-surface-1)] z-20 shadow-[0_1px_0_var(--color-border)]">
                    <tr className="border-b border-[var(--color-border)]">
                      <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">
                        Title
                      </th>
                      <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">
                        Kind
                      </th>
                      <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">
                        Link
                      </th>
                      <th
                        scope="col"
                        className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium hidden md:table-cell"
                      >
                        Created At
                      </th>
                      <th className="sticky right-0 py-3 px-4 text-right text-[var(--color-text-muted)] font-medium bg-[var(--color-surface-1)] z-10">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvents.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 px-4 text-center text-[var(--color-text-muted)]">
                          No RSVP links match your search.
                        </td>
                      </tr>
                    ) : (
                      filteredEvents.map((e) => (
                        <tr key={e.id} className="border-b border-[var(--color-border)] last:border-0">
                          <td className="py-3 px-4 text-[var(--color-text-primary)] font-medium">{e.title}</td>
                          <td className="py-3 px-4">
                            <span className="text-xs font-medium px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]">
                              {e.kind === "external_link" ? "External Link" : "Hosted Template"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[var(--color-text-muted)] font-mono text-xs">
                            {typeof window !== "undefined" && (
                              <CopyableValue value={`${window.location.origin}/receiver/${e.slug}`} label="RSVP link" />
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
              </div>
            </Card>
          </section>
        </div>
      </div>
    </>
  );
}

export default function AdminDbPage() {
  return (
    <ToastProvider>
      <AdminDbContent />
    </ToastProvider>
  );
}

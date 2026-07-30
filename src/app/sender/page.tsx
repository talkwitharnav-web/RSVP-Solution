"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MailOpen, LayoutGrid, FolderClock, LogOut, Plus } from "lucide-react";
import { NewInvitationModal } from "./NewInvitationModal";
import { InvitationGallery } from "./InvitationGallery";

type Tab = "overview" | "invitations";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  return res.json();
}

export default function SenderDashboardPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [newInvitationOpen, setNewInvitationOpen] = useState(false);

  useEffect(() => {
    fetchJson<{ sender: { username: string } | null }>("/api/session").then((session) => {
      if (!session.sender) {
        router.replace("/sender/landing");
        return;
      }
      setUsername(session.sender.username);
      setChecking(false);
    });
  }, [router]);

  const handleLogout = async () => {
    await fetch("/api/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "sender" }),
    });
    router.replace("/sender/landing");
  };

  if (checking) return null;

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="flex w-full flex-shrink-0 flex-col border-b border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 py-4 md:min-h-dvh md:w-64 md:border-b-0 md:border-r md:px-5 md:py-6">
        <div className="mb-4 flex items-center gap-3 px-3 pr-16 text-[var(--color-accent-lavender)] md:mb-8 md:pr-3">
          <MailOpen className="h-4 w-4 flex-shrink-0" strokeWidth={2} />
          <span className="text-xl font-semibold text-[var(--color-text-primary)]">RSVP Sender</span>
        </div>

        <button
          type="button"
          onClick={() => setNewInvitationOpen(true)}
          className="mb-3 flex items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-accent-coral-text)] px-3 py-2.5 text-sm font-semibold text-[var(--color-on-coral)] transition-opacity hover:opacity-90 md:mb-4"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          New Invitation
        </button>

        <nav className="flex flex-col gap-1">
          <SidebarNavButton
            label="Overview"
            Icon={LayoutGrid}
            iconColorVar="--color-accent-sage"
            active={activeTab === "overview"}
            onClick={() => setActiveTab("overview")}
          />
          <SidebarNavButton
            label="Pick Up Where You Left Off"
            Icon={FolderClock}
            iconColorVar="--color-accent-coral-text"
            active={activeTab === "invitations"}
            onClick={() => setActiveTab("invitations")}
          />
        </nav>

        <div className="hidden flex-1 md:block" />

        <div className="mt-4 flex flex-col items-stretch gap-1 border-t border-[var(--color-border)] pt-4 md:block">
          <p className="min-w-0 px-3 pb-2 text-xs text-[var(--color-text-muted)]">
            Signed in as <span className="text-[var(--color-text-primary)] font-medium">{username}</span>
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full flex-shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]"
          >
            <LogOut className="h-4 w-4" strokeWidth={2} />
            Log Out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 md:py-10 lg:px-12">
        {activeTab === "overview" && (
          <div className="max-w-2xl">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[var(--color-text-primary)] mb-3">
              Welcome back
            </h1>
            <p className="text-[var(--color-text-muted)] mb-6">
              Start a new invitation, or pick up an existing one from where you left off.
            </p>
            <button
              type="button"
              onClick={() => setActiveTab("invitations")}
              className="text-sm font-semibold text-[var(--color-accent-coral-text)] hover:underline"
            >
              View your invitations &rarr;
            </button>
          </div>
        )}
        {activeTab === "invitations" && <InvitationGallery />}
      </main>

      <NewInvitationModal isOpen={newInvitationOpen} onClose={() => setNewInvitationOpen(false)} />
    </div>
  );
}

function SidebarNavButton({
  label,
  Icon,
  iconColorVar,
  active,
  onClick,
}: {
  label: string;
  Icon: typeof LayoutGrid;
  iconColorVar: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        active
          ? "bg-[var(--color-surface-2)] text-[var(--color-text-primary)] font-semibold"
          : "text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]"
      }`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={2} aria-hidden style={{ color: `var(${iconColorVar})` }} />
      {label}
    </button>
  );
}

import Link from "next/link";
import { MailOpen, Send, Inbox, Database, Sun, LogOut, type LucideIcon } from "lucide-react";

export default function AdminGatewayPage() {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 flex-shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-raised)] px-5 py-6">
        <div className="mb-8 flex items-center gap-3 px-3 text-[var(--color-accent-coral-text)]">
          <MailOpen className="h-4 w-4 flex-shrink-0" strokeWidth={2} />
          <span className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--color-text-primary)]">
            RSVP
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          <AdminNavLink href="/admin/sender" label="RSVP Sender" Icon={Send} />
          <AdminNavLink href="/admin/receiver" label="RSVP Receiver" Icon={Inbox} />
          <AdminNavLink href="/admin/db" label="Access DB" Icon={Database} />
        </nav>

        <button
          type="button"
          className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-base)] hover:text-[var(--color-text-primary)]"
        >
          <LogOut className="h-4 w-4" strokeWidth={2} />
          Log Out
        </button>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end px-6 py-4">
          <div className="flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-raised)] p-1">
            <span className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-[var(--color-text-muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent-sage)]" />
              Healthy
            </span>
            <button
              type="button"
              aria-label="Toggle theme"
              className="rounded-full p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-base)] hover:text-[var(--color-text-primary)]"
            >
              <Sun className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center">
          {/* Mascot/illustration goes here later. */}
        </main>
      </div>
    </div>
  );
}

function AdminNavLink({
  href,
  label,
  Icon,
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-base)]"
    >
      <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
      {label}
    </Link>
  );
}

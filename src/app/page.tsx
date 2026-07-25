import Link from "next/link";
import { MailOpen, Send, Inbox, Database, LogOut, type LucideIcon } from "lucide-react";
import { SettingsToggles } from "@/components/ui/SettingsToggles";
import { HealthPin } from "@/components/ui/HealthPin";

export default function AdminGatewayPage() {
  return (
    <div className="flex min-h-screen">
      <SettingsToggles health={<HealthPin />} />

      <aside className="flex w-64 flex-shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-1)] px-5 py-6">
        <div className="mb-8 flex items-center gap-3 px-3 text-[var(--color-accent-coral-text)]">
          <MailOpen className="h-4 w-4 flex-shrink-0" strokeWidth={2} />
          <span className="text-xl font-semibold text-[var(--color-text-primary)]">RSVP</span>
        </div>

        <nav className="flex flex-col gap-1">
          {/* Sender/Receiver are the app's two audiences (a host sending an
              RSVP, a guest receiving one), not admin-only tools. Access DB
              IS an admin tool, but sits in this same top group -- Log Out
              is the one item that needs real separation, since it's
              destructive-ish and sits right below Access DB in the
              reference project's own layout, not adjacent to it. Putting
              Log Out right next to Access DB invited an easy overshoot
              misclick. */}
          <GatewayNavLink href="/sender" label="RSVP Sender" Icon={Send} />
          <GatewayNavLink href="/receiver" label="RSVP Receiver" Icon={Inbox} />
          <GatewayNavLink href="/admin/db" label="Access DB" Icon={Database} />
        </nav>

        <div className="flex-1" />

        <button
          type="button"
          className="flex items-center gap-3 rounded-lg px-3 py-2 pt-4 mt-4 border-t border-[var(--color-border)] text-left text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]"
        >
          <LogOut className="h-4 w-4" strokeWidth={2} />
          Log Out
        </button>
      </aside>

      <main className="flex flex-1 items-center justify-center">
        {/* Mascot/illustration goes here later. */}
      </main>
    </div>
  );
}

function GatewayNavLink({
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
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-2)]"
    >
      <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
      {label}
    </Link>
  );
}

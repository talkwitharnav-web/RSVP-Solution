"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";
import { MailOpen, Send, Inbox, Database, LogOut, Lock, type LucideIcon } from "lucide-react";
import { SettingsToggles } from "@/components/ui/SettingsToggles";
import { HealthPin } from "@/components/ui/HealthPin";
import { AuthCard } from "@/components/ui/AuthCard";
import { Input, Label } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";

export default function AdminGatewayPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasAdminSession, setHasAdminSession] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetch("/api/session")
      .then((res) => res.json())
      .then((session) => {
        setHasAdminSession(!!session.admin);
        setCheckingSession(false);
      })
      .catch(() => setCheckingSession(false));
  }, []);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, rememberMe }),
      });
      if (!response.ok) {
        setError("Invalid credentials. Please try again.");
        setIsLoading(false);
        return;
      }
      setHasAdminSession(true);
    } catch {
      setError("Invalid credentials. Please try again.");
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "admin" }),
    });
    setHasAdminSession(false);
    setUsername("");
    setPassword("");
  };

  return (
    <div className="flex min-h-screen">
      <SettingsToggles health={hasAdminSession ? <HealthPin /> : undefined} />

      <aside className="flex w-64 flex-shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-1)] px-5 py-6">
        <div className="mb-8 flex items-center gap-3 px-3 text-[var(--color-accent-lavender)]">
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
          <GatewayNavLink href="/sender" label="RSVP Sender" Icon={Send} iconColorVar="--color-accent-coral-text" />
          <GatewayNavLink href="/receiver" label="RSVP Receiver" Icon={Inbox} iconColorVar="--color-accent-sage" />
          {hasAdminSession && (
            <GatewayNavLink href="/admin/db" label="Access DB" Icon={Database} iconColorVar="--color-accent-lavender" />
          )}
        </nav>

        <div className="flex-1" />

        {hasAdminSession && (
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-3 rounded-lg px-3 py-2 pt-4 mt-4 border-t border-[var(--color-border)] text-left text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]"
          >
            <LogOut className="h-4 w-4" strokeWidth={2} />
            Log Out
          </button>
        )}
      </aside>

      <main className="flex flex-1 items-center justify-center">
        {checkingSession || hasAdminSession ? (
          // Mascot/illustration goes here later -- an empty reserved area
          // reads better than a stray status sentence once logged in.
          null
        ) : (
          <AuthCard title="Admin Access" onSubmit={handleLogin} error={error} fillParent>
            <div className="hidden sm:flex justify-center mb-2">
              <Lock className="w-8 h-8 text-[var(--color-accent-coral-text)]" />
            </div>
            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Checkbox
              label="Remember Me"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            <Button type="submit" size="lg" disabled={isLoading} className="w-full">
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </AuthCard>
        )}
      </main>
    </div>
  );
}

function GatewayNavLink({
  href,
  label,
  Icon,
  iconColorVar,
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
  // Each nav item's icon takes one of the three accent colors so the
  // sidebar itself carries the coral/sage/lavender identity instead of
  // reading as a single-accent (coral-only) list -- see CLAUDE.md.
  iconColorVar: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-2)]"
    >
      <Icon className="h-4 w-4" strokeWidth={2} aria-hidden style={{ color: `var(${iconColorVar})` }} />
      {label}
    </Link>
  );
}

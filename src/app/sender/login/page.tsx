"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/ui/AuthCard";
import { Input, Label } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed with status ${res.status}`);
  return json;
}

export default function SenderLoginPage() {
  const router = useRouter();
  const showToast = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Starts true so the bare form never flashes before we've checked both
  // whether an account already exists (no accounts -> force signup) and
  // whether this browser already has a valid sender session (skip straight
  // past login).
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const session = await fetchJson<{ sender: { username: string } | null }>("/api/session");
        if (session.sender) {
          router.replace("/sender");
          return;
        }
      } catch {
        // fall through to the has-account check
      }
      try {
        const { hasAccount } = await fetchJson<{ hasAccount: boolean }>("/api/sender/has-account");
        if (!hasAccount) {
          router.replace("/sender/signup");
          return;
        }
      } catch {
        // if the check fails, just show the login form
      }
      setChecking(false);
    })();
  }, [router]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await fetchJson("/api/sender/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, rememberMe }),
      });
      router.push("/sender");
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unknown error occurred";
      setError(message);
      showToast(`Login failed \u2014 ${message}`, "error");
      setIsLoading(false);
    }
  };

  if (checking) return null;

  return (
    <AuthCard
      title="Sender Login"
      onSubmit={handleLogin}
      error={error}
      footer={
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            New here?{" "}
            <button
              type="button"
              onClick={() => router.push("/sender/signup")}
              className="font-semibold text-[var(--color-accent-coral-text)] hover:underline"
            >
              Create an account
            </button>
          </p>
          <button
            type="button"
            onClick={() => router.push("/sender/landing")}
            className="text-xs text-[var(--color-text-muted)] hover:underline"
          >
            &larr; Back to overview
          </button>
        </div>
      }
    >
      <div>
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => {
            setError(null);
            setUsername(e.target.value);
          }}
          required
        />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setError(null);
            setPassword(e.target.value);
          }}
          required
        />
      </div>
      <Checkbox label="Remember Me" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
      <Button type="submit" size="lg" disabled={isLoading} className="w-full">
        {isLoading ? "Signing in..." : "Sign In"}
      </Button>
    </AuthCard>
  );
}

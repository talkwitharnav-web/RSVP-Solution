"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/ui/AuthCard";
import { Input, Label } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { StrengthMeter } from "@/components/ui/StrengthMeter";
import { useToast } from "@/components/ui/Toast";
import { scorePasswordStrength } from "@/lib/credential-strength";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed with status ${res.status}`);
  return json;
}

export default function SenderSignupPage() {
  const router = useRouter();
  const showToast = useToast();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetchJson<{ sender: { username: string } | null }>("/api/session")
      .then((session) => {
        if (session.sender) {
          router.replace("/sender");
          return;
        }
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const trimmedName = name.trim();
    const trimmedUsername = username.trim();
    if (!trimmedName || !trimmedUsername) {
      setError("Name and username are required.");
      setIsLoading(false);
      return;
    }

    try {
      await fetchJson("/api/sender/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, username: trimmedUsername, password, rememberMe }),
      });
      router.push("/sender");
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unknown error occurred";
      setError(message);
      showToast(`Couldn't create your account \u2014 ${message}`, "error");
      setIsLoading(false);
    }
  };

  if (checking) return null;

  return (
    <AuthCard
      title="Create Sender Account"
      onSubmit={handleRegister}
      error={error}
      footer={
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => router.push("/sender/login")}
              className="font-semibold text-[var(--color-accent-coral-text)] hover:underline"
            >
              Log in
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
        <Label htmlFor="name">Your Name</Label>
        <Input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value.replace(/\s{2,}/g, " "))}
          placeholder="e.g., 'Jordan Lee'"
          required
        />
      </div>
      <div>
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
          required
        />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={200}
          aria-describedby="password-requirements"
          value={password}
          onChange={(e) => setPassword(e.target.value.replace(/\s/g, ""))}
          placeholder="••••••••"
          required
        />
        <p id="password-requirements" className="mt-1.5 text-xs text-[var(--color-text-muted)]">
          Use 8–200 characters with no spaces.
        </p>
        <StrengthMeter {...scorePasswordStrength(password)} empty={password.length === 0} />
      </div>
      <Checkbox label="Remember Me" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
      <Button type="submit" size="lg" disabled={isLoading} className="w-full">
        {isLoading ? "Creating..." : "Create Account"}
      </Button>
    </AuthCard>
  );
}

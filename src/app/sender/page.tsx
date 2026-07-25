"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  return res.json();
}

export default function RsvpSenderPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<{ sender: { username: string } | null }>("/api/session").then((session) => {
      if (!session.sender) {
        router.replace("/sender/login");
        return;
      }
      setUsername(session.sender.username);
      setChecking(false);
    });
  }, [router]);

  if (checking) return null;

  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <p className="text-[var(--color-text-muted)]">
        Signed in as <strong className="text-[var(--color-text-primary)]">{username}</strong>.
        The sender dashboard itself is coming next.
      </p>
    </div>
  );
}

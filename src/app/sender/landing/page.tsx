"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MailOpen, Palette, ImageUp, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function SenderLandingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/session")
      .then((res) => res.json())
      .then((session) => {
        if (session.sender) {
          router.replace("/sender");
          return;
        }
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  if (checking) return null;

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="flex items-center justify-between gap-2 px-4 py-5 sm:gap-4 sm:px-10">
        <div className="flex min-w-0 items-center gap-2 text-[var(--color-accent-lavender)]">
          <MailOpen className="h-5 w-5" strokeWidth={2} />
          <span className="whitespace-nowrap font-display text-lg font-semibold text-[var(--color-text-primary)] sm:text-xl">
            RSVP Sender
          </span>
        </div>
        {/* mr-11 clears the globally-mounted settings pill, a fixed top-right
            overlay that was measurably covering the right 13px of Sign Up and
            making part of the primary call to action unclickable. A static
            margin rather than a width-tracking reserve: the pill should draw
            over things when it expands, not make the header shuffle around
            as it opens and closes. */}
        <div className="mr-11 flex flex-shrink-0 items-center gap-2 sm:gap-3">
          <Link href="/sender/login" className="hidden sm:block">
            <Button variant="secondary">Log In</Button>
          </Link>
          <Link href="/sender/signup">
            <Button variant="primary">Sign Up</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-6 py-10 sm:py-16">
        <div className="max-w-2xl text-center">
          <h1 className="font-display text-3xl sm:text-5xl font-semibold text-[var(--color-text-primary)] mb-5 text-balance">
            Send invitations guests actually open.
          </h1>
          <p className="text-base sm:text-lg text-[var(--color-text-muted)] mb-8 text-balance">
            Create a beautiful RSVP page in minutes, share one link, and watch responses roll in —
            no spreadsheets, no group texts, no guessing who&apos;s coming.
          </p>
          <div className="flex flex-col items-stretch justify-center gap-3 min-[360px]:flex-row min-[360px]:items-center">
            <Link href="/sender/signup" className="w-full min-[360px]:w-auto">
              <Button size="lg" variant="primary" className="w-full">
                Get Started
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/sender/login" className="w-full min-[360px]:w-auto">
              <Button size="lg" variant="secondary" className="w-full">
                Log In
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-16 sm:mt-24 grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-4xl w-full">
          <Card className="flex flex-col gap-4">
            <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--color-accent-sage)]/15 flex items-center justify-center">
              <Palette className="w-6 h-6 text-[var(--color-accent-sage)]" strokeWidth={2} />
            </div>
            <div>
              <h2 className="font-display text-xl font-semibold text-[var(--color-text-primary)] mb-2">
                Design it with us
              </h2>
              <p className="text-sm text-[var(--color-text-muted)]">
                Pick a preset that matches your occasion, then mix and match colors, layouts, and
                details until it feels like yours. No design skills required — just point, click,
                and RSVP.
              </p>
            </div>
          </Card>

          <Card className="flex flex-col gap-4">
            <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--color-accent-coral)]/15 flex items-center justify-center">
              <ImageUp className="w-6 h-6 text-[var(--color-accent-coral-text)]" strokeWidth={2} />
            </div>
            <div>
              <h2 className="font-display text-xl font-semibold text-[var(--color-text-primary)] mb-2">
                Bring your own card
              </h2>
              <p className="text-sm text-[var(--color-text-muted)]">
                Already have an invitation designed? Upload it as-is, add the essentials — time,
                place, host — and we&apos;ll turn it into a shareable link with a real RSVP form
                attached.
              </p>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}

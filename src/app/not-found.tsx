import Link from "next/link";
import { MailOpen, Home } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Global 404 -- catches any unmatched route, plus every explicit notFound()
 * call (e.g. an unknown /e/[slug] or unpublished /receiver/[slug]). Themed
 * to match the rest of the app rather than the default Next.js error page.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 flex items-center gap-3 text-[var(--color-accent-lavender)]">
        <MailOpen className="h-8 w-8" strokeWidth={1.75} />
        <span className="font-display text-2xl font-semibold text-[var(--color-text-primary)]">RSVP</span>
      </div>

      <p className="font-display text-7xl font-semibold text-[var(--color-accent-coral-text)] mb-4">404</p>

      <h1 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">
        This invitation seems to have gotten lost in the mail
      </h1>
      <p className="text-[var(--color-text-muted)] max-w-sm mb-8">
        The page you&rsquo;re looking for doesn&rsquo;t exist, or the link isn&rsquo;t ready yet.
      </p>

      {/* /sender/landing, not "/" -- the gateway at "/" is localhost-only, so
          for anyone hitting a bad link from another device (which is most of
          the people who will ever see this page) a "Back to home" button
          pointing there just lands them on a second 404. The landing page is
          the only genuinely public entry point. */}
      <Link href="/sender/landing">
        <Button variant="primary" size="lg">
          <Home className="h-4 w-4" strokeWidth={2.25} />
          Back to home
        </Button>
      </Link>
    </div>
  );
}

import { FC, ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const PageHeader: FC<{
  title: string;
  backHref?: string;
  actions?: ReactNode;
  /**
   * Skips reserving clearance for the fixed SettingsToggles pill (see
   * clear-top-right in globals.css). SettingsToggles is a `fixed` overlay —
   * it should float above other UI, not have other UI rearrange itself to
   * avoid it. Opt-out (not opt-in) so existing callers keep today's
   * behavior; pages with a busy action row (e.g. admin/db's Seed/Purge/Back
   * buttons) that were visibly getting shoved left to make room for the
   * pill should pass this.
   */
  noClearTopRight?: boolean;
}> = ({ title, backHref, actions, noClearTopRight = false }) => (
  <header className={`${noClearTopRight ? "" : "clear-top-right"} flex items-center justify-between gap-3 mb-8`}>
    <div className="flex items-center gap-3">
      {backHref && (
        <Link
          href={backHref}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-accent-coral-text)] transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
      )}
      <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--color-text-primary)]">{title}</h1>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
  </header>
);

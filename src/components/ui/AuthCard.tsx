import { FC, FormEvent, ReactNode } from "react";
import { Card } from "./Card";

export const AuthCard: FC<{
  title: string;
  onSubmit: (e: FormEvent) => void;
  children: ReactNode;
  error?: string | null;
  footer?: ReactNode;
  // Standalone auth pages fill the viewport (min-h-dvh). The gateway page
  // nests this inline in the sidebar's empty space instead, where it should
  // just fill its flex parent rather than claim the whole viewport height.
  fillParent?: boolean;
}> = ({ title, onSubmit, children, error, footer, fillParent }) => (
  <div className={`${fillParent ? "flex-1" : "min-h-dvh"} flex items-center justify-center p-3 sm:p-4`}>
    <main className="w-full max-w-md mx-auto">
      <Card className="p-4 sm:p-10">
        <h1 className="font-display text-2xl sm:text-4xl font-semibold text-[var(--color-text-primary)] mb-4 sm:mb-8 text-center">
          {title}
        </h1>
        <form onSubmit={onSubmit} className="space-y-4 sm:space-y-6">
          {children}
        </form>
        {error && (
          <div className="mt-4 sm:mt-6 bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/40 p-4 rounded-[var(--radius-sm)]">
            <p className="font-semibold text-[var(--color-danger)] text-center">{error}</p>
          </div>
        )}
        {footer && <div className="mt-4 sm:mt-8 text-center">{footer}</div>}
      </Card>
    </main>
  </div>
);

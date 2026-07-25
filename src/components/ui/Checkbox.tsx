import { InputHTMLAttributes } from "react";

export function Checkbox({
  label,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex items-center gap-2 text-[var(--color-text-muted)] cursor-pointer select-none">
      <input
        type="checkbox"
        className={`h-4 w-4 rounded border-[var(--color-border-strong)] bg-[var(--color-surface-0)] text-[var(--color-accent-coral-text)] focus:ring-2 focus:ring-[var(--color-accent-coral-text)] focus:ring-offset-0 ${className}`}
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}

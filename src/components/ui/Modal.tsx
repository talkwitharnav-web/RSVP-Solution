"use client";

import { FC, ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { useDropdownReveal } from "@/lib/useDropdownReveal";

interface ModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  danger?: boolean;
  /** "md" (default, max-w-md) or "lg" (max-w-2xl) -- lg is for content that genuinely needs more room, e.g. a two-column form + live preview. */
  size?: "md" | "lg";
}

export const Modal: FC<ModalProps> = ({ isOpen, title, onClose, children, danger = false, size = "md" }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const { shouldRender } = useDropdownReveal(isOpen);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (isOpen && previousFocusRef.current === null) {
      previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }

    if (!shouldRender) {
      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previousFocus?.isConnected) previousFocus.focus();
    }
  }, [isOpen, shouldRender]);

  useEffect(() => {
    if (!shouldRender) return;

    const panel = panelRef.current;
    if (!panel) return;

    const getFocusable = () => {
      return Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true");
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (isOpen) onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = getFocusable();
      if (focusable.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    if (isOpen && !panel.contains(document.activeElement)) {
      const firstFocusable = getFocusable()[0];
      if (firstFocusable) firstFocusable.focus();
      else panel.focus();
    }

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, shouldRender]);

  if (!shouldRender) return null;

  const backdropClass = isOpen ? "modal-backdrop-reveal" : "modal-backdrop-reveal-out";
  const panelClass = isOpen ? "modal-panel-reveal" : "modal-panel-reveal-out";

  return createPortal(
    <div
      className={`fixed inset-0 bg-black/70 modal-backdrop-blur flex justify-center items-center z-50 p-4 ${backdropClass}`}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`bg-[var(--color-surface-1)] border ${
          danger ? "border-[var(--color-danger)]" : "border-[var(--color-border-strong)]"
        } rounded-[var(--radius-md)] shadow-xl p-6 w-full ${size === "lg" ? "max-w-2xl" : "max-w-md"} max-h-[calc(100dvh-2rem)] overflow-y-auto ${panelClass}`}
      >
        <h2
          id="modal-title"
          className={`text-xl font-bold mb-4 font-display ${danger ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]"}`}
        >
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
};

export const ModalActions: FC<{
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  /** Overrides "Cancel" where the dismissive choice is a real option rather than backing out. */
  cancelLabel?: string;
  danger?: boolean;
  confirmDisabled?: boolean;
  submit?: boolean;
}> = ({
  onCancel,
  onConfirm,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  confirmDisabled = false,
  submit = false,
}) => (
  <div className="flex justify-end gap-3 mt-6">
    <Button type="button" variant="secondary" onClick={onCancel}>
      {cancelLabel}
    </Button>
    <Button
      type={submit ? "submit" : "button"}
      variant={danger ? "danger" : "primary"}
      onClick={submit ? undefined : onConfirm}
      disabled={confirmDisabled}
    >
      {confirmLabel}
    </Button>
  </div>
);

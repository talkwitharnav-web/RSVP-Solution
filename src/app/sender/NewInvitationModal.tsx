"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Palette, ImageUp } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { BringYourOwnCardForm } from "./BringYourOwnCardForm";

type Step = "choice" | "byo";

export function NewInvitationModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("choice");

  const handleClose = () => {
    onClose();
    // Reset after the close animation has room to play rather than instantly,
    // so the modal doesn't visibly flash back to the choice screen mid-close.
    setTimeout(() => setStep("choice"), 300);
  };

  return (
    <Modal isOpen={isOpen} title={step === "choice" ? "New Invitation" : "Bring Your Own Card"} onClose={handleClose}>
      {step === "choice" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => {
              handleClose();
              router.push("/create/design");
            }}
            className="flex flex-col items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] p-5 text-center transition-colors hover:bg-[var(--color-border-strong)]"
          >
            <Palette className="h-8 w-8 text-[var(--color-accent-sage)]" strokeWidth={1.5} />
            <span className="font-semibold text-[var(--color-text-primary)]">Design in our editor</span>
            <span className="text-xs text-[var(--color-text-muted)]">Pick a template, then drag it into shape</span>
          </button>
          <button
            type="button"
            onClick={() => setStep("byo")}
            className="flex flex-col items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] p-5 text-center transition-colors hover:bg-[var(--color-border-strong)]"
          >
            <ImageUp className="h-8 w-8 text-[var(--color-accent-coral-text)]" strokeWidth={1.5} />
            <span className="font-semibold text-[var(--color-text-primary)]">Bring your own card</span>
            <span className="text-xs text-[var(--color-text-muted)]">Upload an image you&apos;ve already designed</span>
          </button>
        </div>
      )}

      {step === "byo" && (
        <BringYourOwnCardForm onCancel={() => setStep("choice")} onClose={handleClose} />
      )}

      {step === "choice" && (
        <div className="flex justify-end mt-6">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
        </div>
      )}
    </Modal>
  );
}

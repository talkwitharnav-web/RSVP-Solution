"use client";

import { useState, FormEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus } from "lucide-react";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { isAcceptedImageType, isHeicFile, convertHeicToJpeg } from "@/lib/image-upload";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB — plenty for a card image, keeps the data-URL small enough for a DB column and a single JSON POST body

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function BringYourOwnCardForm({ onCancel, onClose }: { onCancel: () => void; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [hostName, setHostName] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [location, setLocation] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [convertingHeic, setConvertingHeic] = useState(false);

  const handleImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file) return;

    // iPhones default to HEIC/HEIF, which no browser can decode natively --
    // rather than reject it (forcing the host to go find a converter first),
    // transcode it to JPEG right here so the picker just works.
    if (isHeicFile(file)) {
      setConvertingHeic(true);
      setError(null);
      try {
        file = await convertHeicToJpeg(file);
      } catch {
        setError("Couldn't convert that HEIC photo — please try a different image.");
        setConvertingHeic(false);
        return;
      }
      setConvertingHeic(false);
    }

    if (!isAcceptedImageType(file)) {
      setError("Please choose a PNG, JPEG, WebP, GIF, or AVIF image (SVG isn't supported).");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image is too large — please choose one under 5MB.");
      return;
    }
    setError(null);
    const dataUrl = await fileToDataUrl(file);
    setImageDataUrl(dataUrl);
    setImagePreview(dataUrl);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!imageDataUrl) {
      setError("Please upload your invitation card image.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "custom_card",
          title,
          hostName: hostName || null,
          description: description || null,
          eventDate: eventDate || null,
          location: location || null,
          cardImageUrl: imageDataUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      onClose();
      router.push(`/e/${data.slug}?mode=edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="card-image">Invitation image</Label>
        <label
          htmlFor="card-image"
          className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-sm)] border-2 border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-0)] p-4 cursor-pointer hover:border-[var(--color-accent-coral-text)] transition-colors"
        >
          {convertingHeic ? (
            <span className="text-sm text-[var(--color-text-muted)]">Converting HEIC photo...</span>
          ) : imagePreview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local FileReader data URL preview, not a static asset
            <img src={imagePreview} alt="Invitation preview" className="max-h-48 rounded-[var(--radius-sm)] object-contain" />
          ) : (
            <>
              <ImagePlus className="h-8 w-8 text-[var(--color-text-muted)]" strokeWidth={1.5} />
              <span className="text-sm text-[var(--color-text-muted)]">Click to upload an image</span>
              <span className="text-xs text-[var(--color-text-muted)]">PNG, JPEG, WebP, GIF, AVIF, or HEIC</span>
            </>
          )}
        </label>
        <input
          id="card-image"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/heic,image/heif,.heic,.heif"
          onChange={handleImageChange}
          className="sr-only"
        />
      </div>

      <div>
        <Label htmlFor="title">Event title</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div>
        <Label htmlFor="hostName">Host name (optional)</Label>
        <Input id="hostName" value={hostName} onChange={(e) => setHostName(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="eventDate">Date &amp; time (optional)</Label>
        <Input id="eventDate" type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="location">Location (optional)</Label>
        <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="description">Additional details (optional)</Label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-4 py-3 text-base bg-[var(--color-surface-0)] text-[var(--color-text-primary)] border border-[var(--color-border-strong)] rounded-[var(--radius-sm)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-coral-text)] focus:border-[var(--color-accent-coral-text)] transition-colors"
        />
      </div>

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Back
        </Button>
        <Button type="submit" disabled={submitting || convertingHeic}>
          {submitting ? "Creating..." : "Create Invitation"}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useState, useEffect, ChangeEvent, FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ImagePlus, Eye, Rocket, Check } from "lucide-react";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CopyableValue } from "@/components/ui/CopyableValue";
import { isAcceptedImageType, isHeicFile, convertHeicToJpeg, prepareCardImage } from "@/lib/image-upload";
import { formatGuestCategories } from "@/lib/guest-categories";
import { useOptimisticActions } from "@/lib/optimistic";
import type { EventRecord } from "@/lib/types";

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * The real edit surface for an invitation the sender owns -- a form with
 * inline-editable fields and (for custom_card events) an image swap, not
 * just the guest-facing page with a "you own this" label slapped on it.
 * Reuses the same allowlist/HEIC-conversion pipeline as
 * BringYourOwnCardForm since it's the same underlying upload operation.
 */
export default function EventEditor({ initialEvent }: { initialEvent: EventRecord }) {
  const [event, setEvent] = useState(initialEvent);
  const [title, setTitle] = useState(initialEvent.title);
  const [hostName, setHostName] = useState(initialEvent.host_name ?? "");
  const [description, setDescription] = useState(initialEvent.description ?? "");
  const [eventDate, setEventDate] = useState(toDatetimeLocalValue(initialEvent.event_date));
  const [location, setLocation] = useState(initialEvent.location ?? "");
  const [externalUrl, setExternalUrl] = useState(initialEvent.external_url ?? "");
  const [guestCategoriesText, setGuestCategoriesText] = useState(formatGuestCategories(initialEvent.guest_categories));
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(initialEvent.card_image_url);
  const [convertingHeic, setConvertingHeic] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [receiverOrigin, setReceiverOrigin] = useState("");

  // Saving and publishing are predicted locally and rolled back if the
  // server refuses, rather than making the sender watch a round trip --
  // see lib/optimistic.ts.
  const { run, hasPending } = useOptimisticActions();

  // window.location isn't available during SSR -- the copyable receiver
  // link needs the real origin, not a guess, so it's read on mount rather
  // than hardcoded or left relative. Same "sync to real browser state on
  // mount" precedent as ThemeToggle/HealthPin elsewhere in this app.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
    setReceiverOrigin(window.location.origin);
  }, []);

  const handleImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file) return;

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
    setError(null);
    // Compressed to fit the 5MB per-image budget rather than rejected --
    // same pipeline BringYourOwnCardForm uses for the original upload.
    setCompressing(true);
    try {
      const dataUrl = await prepareCardImage(file);
      setImageDataUrl(dataUrl);
      setImagePreview(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't process that image.");
    } finally {
      setCompressing(false);
    }
  };

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    const previousEvent = event;
    const previousSavedAt = savedAt;
    const previousImageDataUrl = imageDataUrl;
    const payload = {
      title,
      hostName: hostName || null,
      description: description || null,
      eventDate: eventDate ? new Date(eventDate).toISOString() : null,
      location: location || null,
      guestCategories: guestCategoriesText,
      ...(event.kind === "external_link" ? { externalUrl } : {}),
      ...(imageDataUrl ? { cardImageUrl: imageDataUrl } : {}),
    };

    void run<EventRecord>({
      apply: () => {
        // Everything here is already on screen in the form -- the only thing
        // changing is the record it's saved against, so predicting it can't
        // show the sender anything they didn't just type.
        setError(null);
        setSavedAt(Date.now());
        setEvent((prev) => ({
          ...prev,
          title,
          host_name: hostName || null,
          description: description || null,
          event_date: payload.eventDate,
          location: location || null,
          ...(imageDataUrl ? { card_image_url: imageDataUrl } : {}),
        }));
        setImageDataUrl(null);
        return () => {
          setEvent(previousEvent);
          setSavedAt(previousSavedAt);
          setImageDataUrl(previousImageDataUrl);
        };
      },
      commit: async () => {
        const res = await fetch(`/api/events/${event.slug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Something went wrong");
        return data as EventRecord;
      },
      // Reconcile with the authoritative row (server-side truncation, the
      // real stored image URL, etc).
      onConfirmed: (saved) => setEvent(saved),
      errorLabel: "Couldn't save your changes",
      onRejected: (err) => setError(`Couldn't save — ${err.message}`),
    });
  };

  const handlePublish = () => {
    const previousEvent = event;
    void run<EventRecord>({
      apply: () => {
        setError(null);
        setEvent((prev) => ({ ...prev, published: true }));
        return () => setEvent(previousEvent);
      },
      commit: async () => {
        const res = await fetch(`/api/events/${event.slug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, published: true }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Something went wrong");
        return data as EventRecord;
      },
      onConfirmed: (saved) => setEvent(saved),
      errorLabel: "Couldn't publish this invitation",
      onRejected: (err) => setError(`Couldn't publish — ${err.message}`),
    });
  };

  const receiverUrl = `${receiverOrigin}/receiver/${event.slug}`;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/sender"
          className="inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          Back to dashboard
        </Link>
        <Link
          href={`/receiver/${event.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-accent-coral-text)] hover:underline"
        >
          <Eye className="h-4 w-4" strokeWidth={2} />
          Preview as Receiver
        </Link>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-3 mb-6">
          <h1 className="font-display text-xl font-semibold text-[var(--color-text-primary)]">
            Edit Invitation
          </h1>
          {event.published && (
            <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-full)] bg-[var(--color-accent-sage)]/15 px-3 py-1 text-xs font-semibold text-[var(--color-accent-sage)]">
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              Published
            </span>
          )}
        </div>

        <div className="mb-6 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
          {event.published ? (
            <>
              <p className="text-sm font-medium text-[var(--color-text-primary)] mb-2">
                This invitation is live -- guests can view and RSVP at:
              </p>
              <CopyableValue value={receiverUrl} label="receiver link" className="text-sm text-[var(--color-accent-coral-text)]" />
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                The link stays the same no matter how many times you edit and save below -- only the
                content guests see updates.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
                This invitation is still a draft -- guests can&apos;t see it yet.
              </p>
              <Button type="button" onClick={handlePublish}>
                <Rocket className="h-4 w-4" strokeWidth={2.5} />
                Publish
              </Button>
            </>
          )}
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {event.kind === "custom_card" && (
            <div>
              <Label htmlFor="card-image">Invitation image</Label>
              <label
                htmlFor="card-image"
                className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-sm)] border-2 border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-0)] p-4 cursor-pointer hover:border-[var(--color-accent-coral-text)] transition-colors"
              >
                {convertingHeic ? (
                  <span className="text-sm text-[var(--color-text-muted)]">Converting HEIC photo...</span>
                ) : compressing ? (
                  <span className="text-sm text-[var(--color-text-muted)]">Compressing image...</span>
                ) : imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data URL / uploaded image, not an optimizable static asset
                  <img src={imagePreview} alt="Invitation preview" className="max-h-48 rounded-[var(--radius-sm)] object-contain" />
                ) : (
                  <>
                    <ImagePlus className="h-8 w-8 text-[var(--color-text-muted)]" strokeWidth={1.5} />
                    <span className="text-sm text-[var(--color-text-muted)]">Click to change image</span>
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
          )}

          <div>
            <Label htmlFor="title">Event title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
          </div>

          <div>
            <Label htmlFor="hostName">Host name</Label>
            <Input id="hostName" value={hostName} onChange={(e) => setHostName(e.target.value)} maxLength={300} />
          </div>
          {event.kind === "external_link" && (
            <div>
              <Label htmlFor="externalUrl">RSVP link</Label>
              <Input
                id="externalUrl"
                type="url"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                maxLength={2048}
                placeholder="https://forms.gle/..."
                required
              />
              <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
                Where the &ldquo;RSVP now&rdquo; button sends your guests. Must start with http:// or https://.
              </p>
            </div>
          )}
          <div>
            <Label htmlFor="eventDate">Date &amp; time</Label>
            <Input id="eventDate" type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="location">Location</Label>
            <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={300} />
          </div>
          <div>
            <Label htmlFor="description">Additional details</Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={5000}
              className="w-full px-4 py-3 text-base bg-[var(--color-surface-0)] text-[var(--color-text-primary)] border border-[var(--color-border-strong)] rounded-[var(--radius-sm)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-coral-text)] focus:border-[var(--color-accent-coral-text)] transition-colors"
            />
          </div>

          {event.kind !== "external_link" && (
            <div>
              <Label htmlFor="guestCategories">Guest categories</Label>
              <Input
                id="guestCategories"
                value={guestCategoriesText}
                onChange={(e) => setGuestCategoriesText(e.target.value)}
                placeholder="Adults, Kids"
              />
              <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
                Comma-separated. Guests will see a count field for each one (e.g. &ldquo;Adults, Kids&rdquo; or
                your own custom list).
              </p>
            </div>
          )}

          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
          {savedAt && !error && (
            <p className="text-sm text-[var(--color-success)]">
              Saved.{hasPending && <span className="text-[var(--color-text-muted)]"> Syncing...</span>}
            </p>
          )}

          <Button type="submit" disabled={convertingHeic || compressing} className="w-full">
            Save Changes
          </Button>
        </form>
      </Card>
    </main>
  );
}

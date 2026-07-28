"use client";

import { useState, useEffect, useCallback, useRef, ChangeEvent, FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ImagePlus,
  Eye,
  Rocket,
  Check,
  Type,
  Trash2,
  BringToFront,
  SendToBack,
} from "lucide-react";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CopyableValue } from "@/components/ui/CopyableValue";
import { isAcceptedImageType, isHeicFile, convertHeicToJpeg } from "@/lib/image-upload";
import { formatGuestCategories } from "@/lib/guest-categories";
import { DESIGN_PALETTES } from "@/lib/design-palettes";
import { DESIGN_ICONS, DESIGN_DECORATIONS } from "@/lib/design-icons";
import { DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT } from "@/lib/design-types";
import { FabricCanvas, FabricCanvasHandle, CanvasLayerSummary } from "@/components/design/FabricCanvas";
import { LayersPanel } from "@/components/design/LayersPanel";
import { FontPicker } from "@/components/design/FontPicker";
import type { EventRecord } from "@/lib/types";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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
  const [guestCategoriesText, setGuestCategoriesText] = useState(formatGuestCategories(initialEvent.guest_categories));
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(initialEvent.card_image_url);
  const [paletteId, setPaletteId] = useState(initialEvent.design_config?.paletteId ?? DESIGN_PALETTES[0].id);
  const [fontPairId, setFontPairId] = useState(initialEvent.design_config?.fontPairId ?? "signature");
  const [hasCanvasSelection, setHasCanvasSelection] = useState(false);
  const [recolorValue, setRecolorValue] = useState("#000000");
  const [layers, setLayers] = useState<CanvasLayerSummary[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const canvasRef = useRef<FabricCanvasHandle>(null);
  const [convertingHeic, setConvertingHeic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [receiverOrigin, setReceiverOrigin] = useState("");

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
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image is too large — please choose one under 5MB.");
      return;
    }
    setError(null);
    const dataUrl = await fileToDataUrl(file);
    setImageDataUrl(dataUrl);
    setImagePreview(dataUrl);
  };

  const refreshLayers = useCallback(() => {
    setLayers(canvasRef.current?.getLayers() ?? []);
  }, []);

  const handleCanvasImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

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
    await canvasRef.current?.addImage(dataUrl);
    refreshLayers();
  };

  const handleCanvasSelectionChange = useCallback(
    (has: boolean) => {
      setHasCanvasSelection(has);
      refreshLayers();
      if (!has) setSelectedLayerId(null);
    },
    [refreshLayers],
  );

  const palette = DESIGN_PALETTES.find((p) => p.id === paletteId) ?? DESIGN_PALETTES[0];

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      const res = await fetch(`/api/events/${event.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          hostName: hostName || null,
          description: description || null,
          eventDate: eventDate ? new Date(eventDate).toISOString() : null,
          location: location || null,
          guestCategories: guestCategoriesText,
          ...(imageDataUrl ? { cardImageUrl: imageDataUrl } : {}),
          ...(event.kind === "designed_template"
            ? {
                designConfig: {
                  paletteId,
                  fontPairId,
                  canvasJSON: canvasRef.current?.getJSON() ?? event.design_config?.canvasJSON ?? { objects: [] },
                  canvasWidth: event.design_config?.canvasWidth ?? DEFAULT_CANVAS_WIDTH,
                  canvasHeight: event.design_config?.canvasHeight ?? DEFAULT_CANVAS_HEIGHT,
                },
              }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setEvent(data);
      setImageDataUrl(null);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${event.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, published: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setEvent(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPublishing(false);
    }
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
              <Button type="button" onClick={handlePublish} disabled={publishing}>
                <Rocket className="h-4 w-4" strokeWidth={2.5} />
                {publishing ? "Publishing..." : "Publish"}
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
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>

          {event.kind === "designed_template" && (
            <p className="text-xs text-[var(--color-text-muted)]">
              These fields are used for your dashboard and RSVP records — add matching text to the card itself below if you want it visible there.
            </p>
          )}
          <div>
            <Label htmlFor="hostName">Host name</Label>
            <Input id="hostName" value={hostName} onChange={(e) => setHostName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="eventDate">Date &amp; time</Label>
            <Input id="eventDate" type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="location">Location</Label>
            <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="description">Additional details</Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 text-base bg-[var(--color-surface-0)] text-[var(--color-text-primary)] border border-[var(--color-border-strong)] rounded-[var(--radius-sm)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-coral-text)] focus:border-[var(--color-accent-coral-text)] transition-colors"
            />
          </div>

          {event.kind === "designed_template" && event.design_config && (
            <div className="space-y-4 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
              <div>
                <Label>Color palette</Label>
                <div className="grid grid-cols-4 gap-2">
                  {DESIGN_PALETTES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPaletteId(p.id)}
                      title={p.name}
                      className={`flex h-8 overflow-hidden rounded-[var(--radius-sm)] border-2 ${
                        paletteId === p.id ? "border-[var(--color-accent-coral-text)]" : "border-transparent"
                      }`}
                      style={{ backgroundColor: p.background }}
                    >
                      <span className="ml-auto h-full w-3" style={{ backgroundColor: p.accent }} />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label>Font pairing</Label>
                <FontPicker value={fontPairId} onChange={setFontPairId} />
              </div>

              <div>
                <Label>Add to card</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      canvasRef.current?.addText();
                      refreshLayers();
                    }}
                  >
                    <Type className="h-4 w-4" strokeWidth={2} />
                    Text
                  </Button>
                  <label
                    htmlFor="canvas-image"
                    className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-0)] transition-colors"
                  >
                    <ImagePlus className="h-4 w-4" strokeWidth={2} />
                    {convertingHeic ? "Converting..." : "Image"}
                  </label>
                  <input
                    id="canvas-image"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/heic,image/heif,.heic,.heif"
                    onChange={handleCanvasImageChange}
                    className="sr-only"
                  />
                </div>
              </div>

              <div>
                <Label>Icons</Label>
                <p className="mb-1.5 text-[0.65rem] text-[var(--color-text-muted)]">Icons keep their shape when resized.</p>
                <div className="flex flex-wrap gap-2">
                  {DESIGN_ICONS.map((icon) => (
                    <button
                      key={icon.id}
                      type="button"
                      onClick={() => {
                        canvasRef.current?.addIcon(icon, palette.accent);
                        refreshLayers();
                      }}
                      title={icon.name}
                      className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border-2 border-[var(--color-border-strong)] hover:border-[var(--color-accent-coral-text)] transition-colors"
                    >
                      <icon.Icon className="h-4 w-4 text-[var(--color-text-primary)]" strokeWidth={1.75} />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label>Decorations</Label>
                <div className="flex flex-wrap gap-2">
                  {DESIGN_DECORATIONS.map((decoration) => (
                    <button
                      key={decoration.id}
                      type="button"
                      onClick={() => {
                        canvasRef.current?.addDecoration(decoration, palette.accent);
                        refreshLayers();
                      }}
                      title={decoration.name}
                      className="flex h-9 items-center justify-center rounded-[var(--radius-sm)] border-2 border-[var(--color-border-strong)] px-2 text-xs text-[var(--color-text-primary)] hover:border-[var(--color-accent-coral-text)] transition-colors"
                    >
                      {decoration.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label>Layers</Label>
                <LayersPanel
                  layers={layers}
                  selectedLayerId={selectedLayerId}
                  onSelect={(layerId) => {
                    canvasRef.current?.selectLayer(layerId);
                    setSelectedLayerId(layerId);
                  }}
                  onMoveUp={(layerId, index) => {
                    canvasRef.current?.moveLayer(layerId, Math.max(0, index - 1));
                    refreshLayers();
                  }}
                  onMoveDown={(layerId, index) => {
                    canvasRef.current?.moveLayer(layerId, index + 1);
                    refreshLayers();
                  }}
                  onDelete={(layerId) => {
                    canvasRef.current?.deleteLayer(layerId);
                    refreshLayers();
                  }}
                />
              </div>

              {hasCanvasSelection && (
                <div>
                  <Label>Selected element</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={recolorValue}
                      onChange={(e) => {
                        setRecolorValue(e.target.value);
                        canvasRef.current?.recolorSelected(e.target.value);
                      }}
                      className="h-9 w-9 cursor-pointer rounded-[var(--radius-sm)] border border-[var(--color-border-strong)]"
                      title="Recolor"
                    />
                    <button
                      type="button"
                      onClick={() => canvasRef.current?.bringSelectedToFront()}
                      title="Bring to front"
                      className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-0)]"
                    >
                      <BringToFront className="h-4 w-4" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      onClick={() => canvasRef.current?.sendSelectedToBack()}
                      title="Send to back"
                      className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-0)]"
                    >
                      <SendToBack className="h-4 w-4" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        canvasRef.current?.deleteSelected();
                        refreshLayers();
                      }}
                      title="Delete"
                      className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-danger)] text-[var(--color-danger)] hover:bg-[var(--color-surface-0)]"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              )}

              <div>
                <Label>Card</Label>
                <div
                  className="mx-auto flex w-full max-w-[280px] overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border-strong)]"
                  style={{ aspectRatio: `${event.design_config.canvasWidth} / ${event.design_config.canvasHeight}` }}
                >
                  <FabricCanvas
                    ref={canvasRef}
                    canvasWidth={event.design_config.canvasWidth}
                    canvasHeight={event.design_config.canvasHeight}
                    initialJSON={event.design_config.canvasJSON}
                    backgroundColor={palette.background}
                    className="h-full w-full"
                    onSelectionChange={handleCanvasSelectionChange}
                    onChange={refreshLayers}
                  />
                </div>
              </div>
            </div>
          )}

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
          {savedAt && !error && <p className="text-sm text-[var(--color-success)]">Saved.</p>}

          <Button type="submit" disabled={saving || convertingHeic} className="w-full">
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </Card>
    </main>
  );
}

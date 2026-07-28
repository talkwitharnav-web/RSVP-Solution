"use client";

import { useCallback, useEffect, useRef, useState, FormEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Type,
  ImagePlus,
  Palette,
  Trash2,
  BringToFront,
  SendToBack,
  Layers,
  Info,
  Eye,
  Rocket,
  Check,
} from "lucide-react";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { CopyableValue } from "@/components/ui/CopyableValue";
import { isAcceptedImageType, isHeicFile, convertHeicToJpeg } from "@/lib/image-upload";
import { DESIGN_PALETTES } from "@/lib/design-palettes";
import { DESIGN_ICONS, DESIGN_DECORATIONS } from "@/lib/design-icons";
import { DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT, DEFAULT_DESIGN_COLORS, DesignColors } from "@/lib/design-types";
import { FabricCanvas, FabricCanvasHandle, CanvasLayerSummary } from "@/components/design/FabricCanvas";
import { LayersPanel } from "@/components/design/LayersPanel";
import { FontPicker } from "@/components/design/FontPicker";
import { ColorFieldGroup } from "@/components/design/ColorField";
import type { EventRecord } from "@/lib/types";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

type Tab = "elements" | "layers" | "style" | "details";

const TABS: { id: Tab; label: string; Icon: typeof Type }[] = [
  { id: "elements", label: "Elements", Icon: Type },
  { id: "layers", label: "Layers", Icon: Layers },
  { id: "style", label: "Style", Icon: Palette },
  { id: "details", label: "Details", Icon: Info },
];

/**
 * "Design in our editor" -- a dedicated full-page Canva-style workspace for
 * the designed_template EventKind. Doubles as both the first-time creation
 * flow and the permanent ongoing editor for an already-created invitation
 * (initialEvent present) -- per explicit user instruction that once an
 * invitation exists, its unique link should be where you always go back to
 * keep working on it, rather than a separate one-shot create page handing
 * off to a differently-shaped edit page. The button reads "Create
 * Invitation" pre-creation and "Save Changes" once initialEvent exists.
 *
 * Colors are five independent free-form fields (background/text/textMuted/
 * accent/onAccent), not a pick-one-of-four theme -- palette presets are just
 * a quick-fill starting point now. Only an event title is required to
 * create or save, per explicit instruction.
 */
export default function DesignEditor({ initialEvent }: { initialEvent?: EventRecord }) {
  const router = useRouter();
  const isEditing = !!initialEvent;
  const [tab, setTab] = useState<Tab>("elements");
  const canvasRef = useRef<FabricCanvasHandle>(null);

  const [event, setEvent] = useState(initialEvent ?? null);
  const [colors, setColors] = useState<DesignColors>(initialEvent?.design_config?.colors ?? DEFAULT_DESIGN_COLORS);
  const [fontPairId, setFontPairId] = useState(initialEvent?.design_config?.fontPairId ?? "signature");
  const [title, setTitle] = useState(initialEvent?.title ?? "");
  const [hostName, setHostName] = useState(initialEvent?.host_name ?? "");
  const [description, setDescription] = useState(initialEvent?.description ?? "");
  const [eventDate, setEventDate] = useState(initialEvent?.event_date ? toDatetimeLocalValue(initialEvent.event_date) : "");
  const [location, setLocation] = useState(initialEvent?.location ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [convertingHeic, setConvertingHeic] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [recolorValue, setRecolorValue] = useState("#000000");
  const [layers, setLayers] = useState<CanvasLayerSummary[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [receiverOrigin, setReceiverOrigin] = useState("");

  // window.location isn't available during SSR -- read on mount rather than
  // hardcoded or left relative, same precedent as EventEditor/HealthPin.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
    setReceiverOrigin(window.location.origin);
  }, []);

  const canvasWidth = event?.design_config?.canvasWidth ?? DEFAULT_CANVAS_WIDTH;
  const canvasHeight = event?.design_config?.canvasHeight ?? DEFAULT_CANVAS_HEIGHT;

  const refreshLayers = useCallback(() => {
    setLayers(canvasRef.current?.getLayers() ?? []);
  }, []);

  const handleSelectionChange = useCallback(
    (has: boolean) => {
      setHasSelection(has);
      refreshLayers();
      if (!has) setSelectedLayerId(null);
    },
    [refreshLayers],
  );

  const handleImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setTab("details");
      setError("Event title is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const designConfig = {
        fontPairId,
        colors,
        canvasJSON: canvasRef.current?.getJSON() ?? event?.design_config?.canvasJSON ?? { objects: [] },
        canvasWidth,
        canvasHeight,
      };
      const payload = {
        title,
        hostName: hostName || null,
        description: description || null,
        eventDate: eventDate ? new Date(eventDate).toISOString() : null,
        location: location || null,
        designConfig,
      };

      const res = isEditing
        ? await fetch(`/api/events/${event!.slug}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: "designed_template", ...payload }),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");

      if (isEditing) {
        setEvent(data);
        setSavedAt(Date.now());
      } else {
        router.push(`/create/design/${data.slug}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePublish = async () => {
    if (!event) return;
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

  const receiverUrl = event ? `${receiverOrigin}/receiver/${event.slug}` : "";

  return (
    <div className="flex h-screen">
      <aside className="flex w-80 flex-shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-1)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <Link
            href="/sender"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
            {isEditing ? "Dashboard" : "Cancel"}
          </Link>
          {isEditing && (
            <Link
              href={`/receiver/${event!.slug}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-accent-coral-text)] hover:underline"
            >
              <Eye className="h-3.5 w-3.5" strokeWidth={2} />
              Preview
            </Link>
          )}
        </div>

        {isEditing && (
          <div className="border-b border-[var(--color-border)] px-5 py-4">
            {event!.published ? (
              <>
                <span className="mb-2 inline-flex items-center gap-1.5 rounded-[var(--radius-full)] bg-[var(--color-accent-sage)]/15 px-3 py-1 text-xs font-semibold text-[var(--color-accent-sage)]">
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  Published
                </span>
                <CopyableValue value={receiverUrl} label="receiver link" className="text-xs text-[var(--color-accent-coral-text)]" />
              </>
            ) : (
              <Button type="button" variant="secondary" className="w-full" onClick={handlePublish} disabled={publishing}>
                <Rocket className="h-4 w-4" strokeWidth={2.5} />
                {publishing ? "Publishing..." : "Publish"}
              </Button>
            )}
          </div>
        )}

        <nav className="flex border-b border-[var(--color-border)]">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-1 px-1 py-3 text-[0.7rem] font-medium transition-colors ${
                tab === id
                  ? "border-b-2 border-[var(--color-accent-coral-text)] text-[var(--color-accent-coral-text)]"
                  : "border-b-2 border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
              {label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === "elements" && (
            <div className="space-y-5">
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    canvasRef.current?.addText();
                    refreshLayers();
                  }}
                >
                  <Type className="h-4 w-4" strokeWidth={2} />
                  Add Text
                </Button>
                <label
                  htmlFor="card-image"
                  className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] transition-colors"
                >
                  <ImagePlus className="h-4 w-4" strokeWidth={2} />
                  {convertingHeic ? "Converting HEIC photo..." : "Upload Image"}
                </label>
                <input
                  id="card-image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/heic,image/heif,.heic,.heif"
                  onChange={handleImageChange}
                  className="sr-only"
                />
              </div>

              {hasSelection && (
                <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] p-3">
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
                <Label>Icons</Label>
                <p className="mb-2 text-[0.65rem] text-[var(--color-text-muted)]">Icons keep their shape when resized.</p>
                <div className="flex flex-wrap gap-2">
                  {DESIGN_ICONS.map((icon) => (
                    <button
                      key={icon.id}
                      type="button"
                      onClick={() => {
                        canvasRef.current?.addIcon(icon, colors.accent);
                        refreshLayers();
                      }}
                      title={icon.name}
                      className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] border-2 border-[var(--color-border-strong)] hover:border-[var(--color-accent-coral-text)] transition-colors"
                    >
                      <icon.Icon className="h-5 w-5 text-[var(--color-text-primary)]" strokeWidth={1.75} />
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
                        canvasRef.current?.addDecoration(decoration, colors.accent);
                        refreshLayers();
                      }}
                      title={decoration.name}
                      className="flex h-10 items-center justify-center rounded-[var(--radius-sm)] border-2 border-[var(--color-border-strong)] px-3 text-xs text-[var(--color-text-primary)] hover:border-[var(--color-accent-coral-text)] transition-colors"
                    >
                      {decoration.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "layers" && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--color-text-muted)]">
                Top of the list draws in front. Use the arrows to reorder, or the canvas itself to drag elements around.
              </p>
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
          )}

          {tab === "style" && (
            <div className="space-y-5">
              <div>
                <Label>Quick-pick presets</Label>
                <div className="grid grid-cols-4 gap-2">
                  {DESIGN_PALETTES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setColors({
                          background: p.background,
                          text: p.text,
                          textMuted: p.textMuted,
                          accent: p.accent,
                          onAccent: p.onAccent,
                        })
                      }
                      title={p.name}
                      className="flex flex-col items-center gap-1.5 rounded-[var(--radius-sm)] border-2 border-transparent p-2 transition-colors hover:border-[var(--color-border-strong)]"
                    >
                      <span className="flex h-8 w-full overflow-hidden rounded-[var(--radius-sm)]" style={{ backgroundColor: p.background }}>
                        <span className="ml-auto h-full w-3" style={{ backgroundColor: p.accent }} />
                      </span>
                      <span className="text-[0.65rem] text-[var(--color-text-primary)]">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label>Colors</Label>
                <ColorFieldGroup colors={colors} onChange={setColors} />
              </div>

              <div>
                <Label>Font pairing</Label>
                <FontPicker value={fontPairId} onChange={setFontPairId} />
              </div>
            </div>
          )}

          {tab === "details" && (
            <div className="space-y-4">
              <p className="text-xs text-[var(--color-text-muted)]">
                Used for your dashboard and RSVP records — add matching text to the card itself in the Elements tab if you want it visible there.
              </p>
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
            </div>
          )}
        </div>

        <div className="border-t border-[var(--color-border)] p-5">
          {error && <p className="mb-3 text-sm text-[var(--color-danger)]">{error}</p>}
          {savedAt && !error && <p className="mb-3 text-sm text-[var(--color-success)]">Saved.</p>}
          <Button type="button" onClick={handleSubmit} disabled={submitting || convertingHeic} className="w-full">
            {submitting ? "Saving..." : isEditing ? "Save Changes" : "Create Invitation"}
          </Button>
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center overflow-y-auto bg-[var(--color-surface-0)] p-10">
        <div
          className="flex w-full max-w-xl overflow-hidden rounded-[var(--radius-md)] shadow-lg"
          style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}` }}
        >
          <FabricCanvas
            ref={canvasRef}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            initialJSON={event?.design_config?.canvasJSON ?? null}
            backgroundColor={colors.background}
            className="h-full w-full"
            onSelectionChange={handleSelectionChange}
            onChange={refreshLayers}
          />
        </div>
      </main>
    </div>
  );
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

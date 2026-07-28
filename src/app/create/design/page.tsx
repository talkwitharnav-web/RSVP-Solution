"use client";

import { useCallback, useMemo, useRef, useState, FormEvent, ChangeEvent } from "react";
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
} from "lucide-react";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { isAcceptedImageType, isHeicFile, convertHeicToJpeg } from "@/lib/image-upload";
import { DESIGN_PALETTES } from "@/lib/design-palettes";
import { DESIGN_ICONS, DESIGN_DECORATIONS } from "@/lib/design-icons";
import { DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT } from "@/lib/design-types";
import { FabricCanvas, FabricCanvasHandle, CanvasLayerSummary } from "@/components/design/FabricCanvas";
import { LayersPanel } from "@/components/design/LayersPanel";
import { FontPicker } from "@/components/design/FontPicker";

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
 * "Design in our editor" -- a dedicated full-page Canva-style workspace
 * (sidebar tabs on the left, the live Fabric.js canvas filling the right)
 * for the designed_template EventKind. Rebuilt (2026-07-28) on a real
 * fabric.Canvas via FabricCanvas -- a sender can add/move/resize/delete
 * text boxes, uploaded images, and icons/decorations freely, replacing the
 * earlier fixed-slot/react-rnd system. See "custom rsvp card designer.md"
 * for the fuller history.
 *
 * h-screen (not min-h-screen) on the outer flex is deliberate -- it's what
 * makes the sidebar's own overflow-y-auto actually clip instead of letting
 * the whole page grow taller than the viewport, which previously dragged
 * the live card canvas out of view whenever a tab's content (e.g. the full
 * font list) was tall.
 */
export default function DesignPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("elements");
  const canvasRef = useRef<FabricCanvasHandle>(null);

  const [paletteId, setPaletteId] = useState(DESIGN_PALETTES[0].id);
  const [fontPairId, setFontPairId] = useState("signature");
  const [title, setTitle] = useState("");
  const [hostName, setHostName] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [convertingHeic, setConvertingHeic] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [recolorValue, setRecolorValue] = useState("#000000");
  const [layers, setLayers] = useState<CanvasLayerSummary[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);

  const palette = useMemo(() => DESIGN_PALETTES.find((p) => p.id === paletteId) ?? DESIGN_PALETTES[0], [paletteId]);

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
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "designed_template",
          title,
          hostName: hostName || null,
          description: description || null,
          eventDate: eventDate || null,
          location: location || null,
          designConfig: {
            paletteId,
            fontPairId,
            canvasJSON: canvasRef.current?.getJSON() ?? { objects: [] },
            canvasWidth: DEFAULT_CANVAS_WIDTH,
            canvasHeight: DEFAULT_CANVAS_HEIGHT,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      router.push(`/e/${data.slug}?mode=edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen">
      <aside className="flex w-80 flex-shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-1)]">
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <Link
            href="/sender"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
            Cancel
          </Link>
        </div>

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
                        canvasRef.current?.addIcon(icon, palette.accent);
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
                        canvasRef.current?.addDecoration(decoration, palette.accent);
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
                <Label>Color palette</Label>
                <div className="grid grid-cols-4 gap-2">
                  {DESIGN_PALETTES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPaletteId(p.id)}
                      title={p.name}
                      className={`flex flex-col items-center gap-1.5 rounded-[var(--radius-sm)] border-2 p-2 transition-colors ${
                        paletteId === p.id ? "border-[var(--color-accent-coral-text)]" : "border-transparent hover:border-[var(--color-border-strong)]"
                      }`}
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
          <Button type="button" onClick={handleSubmit} disabled={submitting || convertingHeic} className="w-full">
            {submitting ? "Creating..." : "Create Invitation"}
          </Button>
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center overflow-y-auto bg-[var(--color-surface-0)] p-10">
        <div
          className="flex w-full max-w-xl overflow-hidden rounded-[var(--radius-md)] shadow-lg"
          style={{ aspectRatio: `${DEFAULT_CANVAS_WIDTH} / ${DEFAULT_CANVAS_HEIGHT}` }}
        >
          <FabricCanvas
            ref={canvasRef}
            canvasWidth={DEFAULT_CANVAS_WIDTH}
            canvasHeight={DEFAULT_CANVAS_HEIGHT}
            initialJSON={null}
            backgroundColor={palette.background}
            className="h-full w-full"
            onSelectionChange={handleSelectionChange}
            onChange={refreshLayers}
          />
        </div>
      </main>
    </div>
  );
}

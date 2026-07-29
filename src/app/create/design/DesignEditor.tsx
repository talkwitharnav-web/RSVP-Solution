"use client";

import { useCallback, useEffect, useRef, useState, DragEvent, FormEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Type,
  Heading,
  ImagePlus,
  Palette,
  Trash2,
  Copy,
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  BringToFront,
  SendToBack,
  Layers,
  LayoutTemplate,
  Info,
  Eye,
  Rocket,
  Check,
  Minus,
  Plus as PlusIcon,
} from "lucide-react";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { CopyableValue } from "@/components/ui/CopyableValue";
import { ThemedTooltip } from "@/components/ui/ThemedTooltip";
import {
  isAcceptedImageType,
  isHeicFile,
  convertHeicToJpeg,
  prepareImageForCanvas,
} from "@/lib/image-upload";
import { DESIGN_PALETTES } from "@/lib/design-palettes";
import { DESIGN_TEMPLATES } from "@/lib/design-templates";
import { DESIGN_ICONS, DESIGN_DECORATIONS } from "@/lib/design-icons";
import { Modal, ModalActions } from "@/components/ui/Modal";
import type { DesignFontRole } from "@/lib/design-fonts";
import {
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_DESIGN_COLORS,
  MAX_CANVAS_JSON_BYTES,
  DesignColors,
} from "@/lib/design-types";
import { FabricCanvas, FabricCanvasHandle, CanvasLayerSummary, SelectedTextProps } from "@/components/design/FabricCanvas";
import { LayersPanel } from "@/components/design/LayersPanel";
import { FontPicker } from "@/components/design/FontPicker";
import { SelectionFontPicker } from "@/components/design/SelectionFontPicker";
import { ColorFieldGroup } from "@/components/design/ColorField";
import { useToast } from "@/components/ui/Toast";
import { useOptimisticActions } from "@/lib/optimistic";
import type { EventRecord } from "@/lib/types";

type Tab = "templates" | "elements" | "layers" | "style" | "details";

const TABS: { id: Tab; label: string; Icon: typeof Type }[] = [
  { id: "templates", label: "Templates", Icon: LayoutTemplate },
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
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [convertingHeic, setConvertingHeic] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [recolorValue, setRecolorValue] = useState("#000000");
  const [layers, setLayers] = useState<CanvasLayerSummary[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [receiverOrigin, setReceiverOrigin] = useState("");
  const [draggingOver, setDraggingOver] = useState(false);
  const [textProps, setTextProps] = useState<SelectedTextProps | null>(null);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  // 1 means "fitted to the panel", which is also the minimum.
  const [zoom, setZoom] = useState(1);
  // The palette a sender just clicked, held until they answer the "recolour
  // the elements too?" prompt. Applying a theme only changes the card's
  // colour *settings*; existing objects keep whatever colour they were given,
  // which is usually not what someone expects after switching theme.
  const [pendingPalette, setPendingPalette] = useState<(typeof DESIGN_PALETTES)[number] | null>(null);
  const [applyingTemplate, setApplyingTemplate] = useState<string | null>(null);
  // Tracks edits made since the last successful save, so navigating away
  // can warn instead of silently discarding a design (nothing autosaves).
  const [isDirty, setIsDirty] = useState(false);

  // Saving an existing invitation and publishing are predicted locally and
  // rolled back if the server refuses -- see lib/optimistic.ts.
  const { run, hasPending } = useOptimisticActions();
  const showToast = useToast();

  // window.location isn't available during SSR -- read on mount rather than
  // hardcoded or left relative, same precedent as EventEditor/HealthPin.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
    setReceiverOrigin(window.location.origin);
  }, []);

  const canvasWidth = event?.design_config?.canvasWidth ?? DEFAULT_CANVAS_WIDTH;
  const canvasHeight = event?.design_config?.canvasHeight ?? DEFAULT_CANVAS_HEIGHT;

  // Which preset (if any) the current colours came from -- drives the
  // "suggested fonts" shortlist. Matched on the values rather than a stored
  // id, since colours are free-form and a sender may have tweaked one field.
  const matchedPalette = DESIGN_PALETTES.find(
    (p) =>
      p.background === colors.background &&
      p.text === colors.text &&
      p.accent === colors.accent,
  );

  // Pulls the current canvas state into the sidebar panels. Deliberately
  // does NOT touch isDirty -- it also runs for the initial load, which is
  // not a user edit.
  const syncPanels = useCallback(() => {
    setLayers(canvasRef.current?.getLayers() ?? []);
    setHistory({
      canUndo: canvasRef.current?.canUndo() ?? false,
      canRedo: canvasRef.current?.canRedo() ?? false,
    });
    setTextProps(canvasRef.current?.getSelectedTextProps() ?? null);
  }, []);

  const refreshLayers = useCallback(() => {
    syncPanels();
    setIsDirty(true);
  }, [syncPanels]);

  // Browsers only allow a generic "leave site?" prompt, but that's still the
  // difference between losing a design and not.
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const handleSelectionChange = useCallback(
    (has: boolean) => {
      setHasSelection(has);
      setLayers(canvasRef.current?.getLayers() ?? []);
      setTextProps(canvasRef.current?.getSelectedTextProps() ?? null);
      if (!has) {
        setSelectedLayerId(null);
        return;
      }
      // Show the selected object's real colour rather than leaving the swatch
      // on whatever was last picked (it used to always open on black).
      const current = canvasRef.current?.getSelectedColor();
      if (current && /^#[0-9a-fA-F]{6}$/.test(current)) setRecolorValue(current);
    },
    [],
  );

  const updateText = (patch: Partial<SelectedTextProps>) => {
    canvasRef.current?.setSelectedTextProps(patch);
    setTextProps(canvasRef.current?.getSelectedTextProps() ?? null);
  };

  /** Empty id means "go back to the card's own font pair". */
  const applySelectionFont = (familyId: string) => {
    void canvasRef.current?.setSelectedFontFamily(familyId).then(() => {
      setTextProps(canvasRef.current?.getSelectedTextProps() ?? null);
    });
  };

  /** Shared by the file picker and by dropping a file onto the canvas. */
  const addImageFile = async (input: File) => {    let file = input;

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
    setCompressing(true);
    try {
      // No size rejection: an oversized photo is compressed down to fit the
      // 5MB per-image budget instead. This also protects the design as a
      // whole -- Fabric embeds image data inline in the saved canvas, so a
      // raw phone photo used to push the whole card past its stored-size cap.
      const dataUrl = await prepareImageForCanvas(file);
      // The original filename becomes the layer label -- a sender who named
      // a file deliberately shouldn't get three rows all called "Image".
      await canvasRef.current?.addImage(dataUrl, file.name);
      refreshLayers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that image.");
    } finally {
      setCompressing(false);
    }
  };

  const handleImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    await addImageFile(file);
  };

  const handleCanvasDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await addImageFile(file);
  };

  const addText = (role: DesignFontRole) => {
    canvasRef.current?.addText(role);
    refreshLayers();
  };

  /** Applies a colour preset's five values; recolouring objects is asked separately. */
  const applyPalette = (palette: (typeof DESIGN_PALETTES)[number]) => {
    setColors({
      background: palette.background,
      text: palette.text,
      textMuted: palette.textMuted,
      accent: palette.accent,
      onAccent: palette.onAccent,
    });
    // Only worth asking if there's actually something on the card to recolour.
    if ((canvasRef.current?.getLayers().length ?? 0) > 0) setPendingPalette(palette);
  };

  const applyTemplate = async (templateId: string) => {
    const template = DESIGN_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    setApplyingTemplate(templateId);
    try {
      setColors(template.colors);
      setFontPairId(template.fontPairId);
      await canvasRef.current?.applyTemplate(template);
      refreshLayers();
      if (!title.trim()) setTitle(template.name);
    } finally {
      setApplyingTemplate(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setTab("details");
      setError("Event title is required.");
      return;
    }
    const designConfig = {
      fontPairId,
      colors,
      canvasJSON: canvasRef.current?.getJSON() ?? event?.design_config?.canvasJSON ?? { objects: [] },
      canvasWidth,
      canvasHeight,
    };

    // The server sanitizer clamps an oversized canvas to an empty one
    // rather than rejecting the request (deliberate, so a hostile caller
    // can't fail a save). For the sender's own browser that would read as
    // "saved fine" followed by a blank card on the next load, so the same
    // bound is checked here and reported as a real error instead.
    if (JSON.stringify(designConfig.canvasJSON).length > MAX_CANVAS_JSON_BYTES) {
      setError("This design is too large to save — try removing or replacing one of the images.");
      return;
    }

    const payload = {
      title,
      hostName: hostName || null,
      description: description || null,
      eventDate: eventDate ? new Date(eventDate).toISOString() : null,
      location: location || null,
      designConfig,
    };

    // Creation is the one thing that genuinely can't be predicted -- it ends
    // in a redirect to a slug only the server can mint, so there's nothing
    // truthful to show early.
    if (!isEditing) {
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "designed_template", ...payload }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Something went wrong");
        setIsDirty(false);
        router.push(`/create/design/${data.slug}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong";
        setError(message);
        showToast(`Couldn't create your invitation \u2014 ${message}`, "error");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const previousEvent = event;
    const previousSavedAt = savedAt;
    void run<EventRecord>({
      apply: () => {
        // "Saved." and the cleared dirty flag are shown on the assumption
        // the server will accept -- the design is already on screen, so
        // nothing new is being invented here.
        setError(null);
        setSavedAt(Date.now());
        setIsDirty(false);
        return () => {
          setEvent(previousEvent);
          setSavedAt(previousSavedAt);
          setIsDirty(true);
        };
      },
      commit: async () => {
        const res = await fetch(`/api/events/${event!.slug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Something went wrong");
        return data as EventRecord;
      },
      onConfirmed: (saved) => setEvent(saved),
      errorLabel: "Couldn't save your card",
      onRejected: (err) => setError(`Couldn't save — ${err.message}`),
    });
  };

  const handlePublish = () => {
    if (!event) return;
    const previousEvent = event;
    void run<EventRecord>({
      apply: () => {
        setError(null);
        setEvent((prev) => (prev ? { ...prev, published: true } : prev));
        return () => setEvent(previousEvent);
      },
      commit: async () => {
        const res = await fetch(`/api/events/${previousEvent.slug}`, {
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

  const receiverUrl = event ? `${receiverOrigin}/receiver/${event.slug}` : "";

  return (
    <div className="flex h-screen">
      <Modal
        isOpen={pendingPalette !== null}
        title="Match your card to this theme?"
        onClose={() => setPendingPalette(null)}
      >
        <p className="mb-6 text-[var(--color-text-muted)]">
          You&apos;ve switched to the <strong>{pendingPalette?.name}</strong> theme. Would you like the text,
          icons and decorations already on your card recoloured to match? You can undo this if you change your mind.
        </p>
        <ModalActions
          onCancel={() => setPendingPalette(null)}
          onConfirm={() => {
            if (pendingPalette) {
              canvasRef.current?.recolorAllToPalette({
                background: pendingPalette.background,
                text: pendingPalette.text,
                textMuted: pendingPalette.textMuted,
                accent: pendingPalette.accent,
                onAccent: pendingPalette.onAccent,
              });
              refreshLayers();
            }
            setPendingPalette(null);
          }}
          cancelLabel="Keep current colours"
          confirmLabel="Recolour to match"
        />
      </Modal>

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
              rel="noopener noreferrer"
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
              <Button type="button" variant="secondary" className="w-full" onClick={handlePublish}>
                <Rocket className="h-4 w-4" strokeWidth={2.5} />
                Publish
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

        <div className="flex items-center gap-1.5 border-b border-[var(--color-border)] px-5 py-2">
          <ThemedTooltip label="Undo (Ctrl+Z)">
            <button
              type="button"
              onClick={() => {
                canvasRef.current?.undo();
                refreshLayers();
              }}
              disabled={!history.canUndo}
              aria-label="Undo"
              className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Undo2 className="h-4 w-4" strokeWidth={2} />
            </button>
          </ThemedTooltip>
          <ThemedTooltip label="Redo (Ctrl+Shift+Z)">
            <button
              type="button"
              onClick={() => {
                canvasRef.current?.redo();
                refreshLayers();
              }}
              disabled={!history.canRedo}
              aria-label="Redo"
              className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Redo2 className="h-4 w-4" strokeWidth={2} />
            </button>
          </ThemedTooltip>
          {isDirty && (
            <span className="ml-auto text-[0.65rem] text-[var(--color-text-muted)]">Unsaved changes</span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === "templates" && (
            <div className="space-y-4">
              <p className="text-xs text-[var(--color-text-muted)]">
                A starting point, not a cage — everything a template adds is an ordinary element you can move,
                edit or delete. Applying one replaces what&apos;s currently on the card.
              </p>
              <div className="space-y-2">
                {DESIGN_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => void applyTemplate(t.id)}
                    disabled={applyingTemplate !== null}
                    className="flex w-full gap-3 rounded-[var(--radius-md)] border-2 border-[var(--color-border-strong)] p-3 text-left transition-colors hover:border-[var(--color-accent-coral-text)] disabled:opacity-50"
                  >
                    {/* Miniature of the template's own palette, so the row previews
                        the result rather than just naming it. */}
                    <span
                      className="flex h-14 w-11 flex-shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)]"
                      style={{ backgroundColor: t.colors.background }}
                      aria-hidden="true"
                    >
                      <span className="h-1.5 w-7 rounded-full" style={{ backgroundColor: t.colors.text }} />
                      <span className="h-1 w-5 rounded-full" style={{ backgroundColor: t.colors.accent }} />
                      <span className="h-1 w-6 rounded-full" style={{ backgroundColor: t.colors.textMuted }} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[var(--color-text-primary)]">
                        {applyingTemplate === t.id ? `Applying ${t.name}...` : t.name}
                      </span>
                      <span className="mt-0.5 block text-[0.7rem] leading-snug text-[var(--color-text-muted)]">
                        {t.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === "elements" && (
            <div className="space-y-5">
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full justify-start gap-2"
                  onClick={() => addText("display")}
                >
                  <Heading className="h-4 w-4" strokeWidth={2} />
                  Add Heading
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full justify-start gap-2"
                  onClick={() => addText("body")}
                >
                  <Type className="h-4 w-4" strokeWidth={2} />
                  Add Body Text
                </Button>
                <label
                  htmlFor="card-image"
                  className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] transition-colors"
                >
                  <ImagePlus className="h-4 w-4" strokeWidth={2} />
                  {convertingHeic ? "Converting HEIC photo..." : compressing ? "Compressing image..." : "Upload Image"}
                </label>
                <input
                  id="card-image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/heic,image/heif,.heic,.heif"
                  onChange={handleImageChange}
                  className="sr-only"
                />
                <p className="text-[0.65rem] text-[var(--color-text-muted)]">
                  Or drag an image straight onto the card.
                </p>
              </div>

              {hasSelection && (
                <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] p-3">
                  <Label>Selected element</Label>
                  <div className="flex items-center gap-2">
                    <ThemedTooltip label="Recolour">
                      <input
                        type="color"
                        value={recolorValue}
                        onChange={(e) => {
                          setRecolorValue(e.target.value);
                          canvasRef.current?.recolorSelected(e.target.value);
                        }}
                        aria-label="Recolour selected element"
                        className="h-9 w-9 cursor-pointer rounded-[var(--radius-sm)] border border-[var(--color-border-strong)]"
                      />
                    </ThemedTooltip>
                    <ThemedTooltip label="Duplicate (Ctrl+D)">
                      <button
                        type="button"
                        onClick={() => {
                          void canvasRef.current?.duplicateSelected().then(refreshLayers);
                        }}
                        aria-label="Duplicate selected element"
                        className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-0)]"
                      >
                        <Copy className="h-4 w-4" strokeWidth={2} />
                      </button>
                    </ThemedTooltip>
                    <ThemedTooltip label="Bring to front">
                      <button
                        type="button"
                        onClick={() => canvasRef.current?.bringSelectedToFront()}
                        aria-label="Bring to front"
                        className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-0)]"
                      >
                        <BringToFront className="h-4 w-4" strokeWidth={2} />
                      </button>
                    </ThemedTooltip>
                    <ThemedTooltip label="Send to back">
                      <button
                        type="button"
                        onClick={() => canvasRef.current?.sendSelectedToBack()}
                        aria-label="Send to back"
                        className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-0)]"
                      >
                        <SendToBack className="h-4 w-4" strokeWidth={2} />
                      </button>
                    </ThemedTooltip>
                    <ThemedTooltip label="Delete" align="right">
                      <button
                        type="button"
                        onClick={() => {
                          canvasRef.current?.deleteSelected();
                          refreshLayers();
                        }}
                        aria-label="Delete selected element"
                        className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-danger)] text-[var(--color-danger)] hover:bg-[var(--color-surface-0)]"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={2} />
                      </button>
                    </ThemedTooltip>
                  </div>

                  {/* Only text objects have type settings, so this whole block
                      stays hidden for images/icons rather than showing
                      controls that would silently do nothing. */}
                  {textProps && (
                    <div className="space-y-2 border-t border-[var(--color-border)] pt-2">
                      {/* Says which characters the controls below will hit --
                          without it, highlighting a few words and clicking
                          Bold looks identical to styling the whole box. */}
                      {textProps.partialSelection && (
                        <p className="rounded-[var(--radius-sm)] bg-[var(--color-accent-lavender)]/15 px-2 py-1 text-[0.6rem] text-[var(--color-text-primary)]">
                          Editing the highlighted text only.
                        </p>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-[0.65rem] text-[var(--color-text-muted)]">Size</span>
                        <input
                          type="range"
                          min={12}
                          max={200}
                          step={1}
                          value={textProps.fontSize}
                          onChange={(e) => updateText({ fontSize: Number(e.target.value) })}
                          aria-label="Font size"
                          className="flex-1 accent-[var(--color-accent-coral-text)]"
                        />
                        <span className="w-9 text-right text-[0.65rem] tabular-nums text-[var(--color-text-primary)]">
                          {Math.round(textProps.fontSize)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {(
                          [
                            ["Bold", Bold, "bold"],
                            ["Italic", Italic, "italic"],
                            ["Underline", Underline, "underline"],
                          ] as const
                        ).map(([label, Icon, key]) => (
                          <ThemedTooltip key={key} label={label}>
                            <button
                              type="button"
                              // Keeps focus inside Fabric's hidden editing
                              // textarea: a blur collapses the highlighted
                              // range, so without this every click would apply
                              // to the whole text box instead.
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => updateText({ [key]: !textProps[key] })}
                              aria-label={label}
                              aria-pressed={textProps[key]}
                              className={`flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border transition-colors ${
                                textProps[key]
                                  ? "border-[var(--color-accent-sage)] bg-[var(--color-accent-sage)]/15 text-[var(--color-accent-sage)]"
                                  : "border-[var(--color-border-strong)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-0)]"
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
                            </button>
                          </ThemedTooltip>
                        ))}
                        <span className="mx-0.5 h-5 w-px bg-[var(--color-border)]" />
                        {(
                          [
                            ["Align left", AlignLeft, "left"],
                            ["Align centre", AlignCenter, "center"],
                            ["Align right", AlignRight, "right"],
                          ] as const
                        ).map(([label, Icon, value]) => (
                          <ThemedTooltip key={value} label={label} align={value === "right" ? "right" : "center"}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => updateText({ textAlign: value })}
                              aria-label={label}
                              aria-pressed={textProps.textAlign === value}
                              className={`flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border transition-colors ${
                                textProps.textAlign === value
                                  ? "border-[var(--color-accent-sage)] bg-[var(--color-accent-sage)]/15 text-[var(--color-accent-sage)]"
                                  : "border-[var(--color-border-strong)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-0)]"
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
                            </button>
                          </ThemedTooltip>
                        ))}
                      </div>
                      <SelectionFontPicker
                        activeFamilyId={textProps.fontFamilyId}
                        partialSelection={textProps.partialSelection}
                        onPick={applySelectionFont}
                      />
                    </div>
                  )}

                  {/* One-click access to this card's own colours, so the five
                      Style-tab fields are actually usable on a selection
                      instead of only ever setting the background. */}
                  <div className="flex items-center gap-1.5 pt-1">
                    {(
                      [
                        ["Text", colors.text],
                        ["Muted text", colors.textMuted],
                        ["Accent", colors.accent],
                        ["On accent", colors.onAccent],
                        ["Background", colors.background],
                      ] as const
                    ).map(([label, value]) => (
                      <ThemedTooltip key={label} label={label}>
                        <button
                          type="button"
                          aria-label={`Apply ${label} colour`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setRecolorValue(value);
                            canvasRef.current?.recolorSelected(value);
                          }}
                          className="h-6 w-6 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)]"
                          style={{ backgroundColor: value }}
                        />
                      </ThemedTooltip>
                    ))}
                  </div>
                  <p className="pt-1 text-[0.65rem] text-[var(--color-text-muted)]">
                    Ctrl+C / Ctrl+V to copy &amp; paste, Ctrl+D to duplicate, Delete to remove.
                  </p>
                </div>
              )}

              <div>
                <Label>Icons</Label>
                <p className="mb-2 text-[0.65rem] text-[var(--color-text-muted)]">Icons keep their shape when resized.</p>
                <div className="flex flex-wrap gap-2">
                  {DESIGN_ICONS.map((icon) => (
                    <ThemedTooltip key={icon.id} label={icon.name}>
                      <button
                        type="button"
                        onClick={() => {
                          canvasRef.current?.addIcon(icon, colors.accent);
                          refreshLayers();
                        }}
                        aria-label={`Add ${icon.name}`}
                        className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] border-2 border-[var(--color-border-strong)] hover:border-[var(--color-accent-coral-text)] transition-colors"
                      >
                        <icon.Icon className="h-5 w-5 text-[var(--color-text-primary)]" strokeWidth={1.75} />
                      </button>
                    </ThemedTooltip>
                  ))}
                </div>
              </div>

              <div>
                <Label>Decorations</Label>
                <div className="flex flex-wrap gap-2">
                  {DESIGN_DECORATIONS.map((decoration) => (
                    <ThemedTooltip key={decoration.id} label={`Add ${decoration.name}`}>
                      <button
                        type="button"
                        onClick={() => {
                          canvasRef.current?.addDecoration(decoration, colors.accent);
                          refreshLayers();
                        }}
                        className="flex h-10 items-center justify-center rounded-[var(--radius-sm)] border-2 border-[var(--color-border-strong)] px-3 text-xs text-[var(--color-text-primary)] hover:border-[var(--color-accent-coral-text)] transition-colors"
                      >
                        {decoration.name}
                      </button>
                    </ThemedTooltip>
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
                    <ThemedTooltip key={p.id} label={p.name}>
                      <button
                        type="button"
                        onClick={() => applyPalette(p)}
                        aria-label={`Apply ${p.name} palette`}
                        className="flex w-full flex-col items-center gap-1.5 rounded-[var(--radius-sm)] border-2 border-transparent p-2 transition-colors hover:border-[var(--color-border-strong)]"
                      >
                        <span className="flex h-8 w-full overflow-hidden rounded-[var(--radius-sm)]" style={{ backgroundColor: p.background }}>
                          <span className="ml-auto h-full w-3" style={{ backgroundColor: p.accent }} />
                        </span>
                        <span className="w-full truncate text-[0.65rem] text-[var(--color-text-primary)]">{p.name}</span>
                      </button>
                    </ThemedTooltip>
                  ))}
                </div>
              </div>

              <div>
                <Label>Colors</Label>
                <ColorFieldGroup colors={colors} onChange={setColors} />
              </div>

              <div>
                <Label>Font pairing</Label>
                <FontPicker
                  value={fontPairId}
                  onChange={setFontPairId}
                  suggestedIds={matchedPalette?.suggestedFontPairIds ?? []}
                  suggestedForName={matchedPalette?.name}
                />
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
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
              </div>
              <div>
                <Label htmlFor="hostName">Host name (optional)</Label>
                <Input id="hostName" value={hostName} onChange={(e) => setHostName(e.target.value)} maxLength={300} />
              </div>
              <div>
                <Label htmlFor="eventDate">Date &amp; time (optional)</Label>
                <Input id="eventDate" type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="location">Location (optional)</Label>
                <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={300} />
              </div>
              <div>
                <Label htmlFor="description">Additional details (optional)</Label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={5000}
                  className="w-full px-4 py-3 text-base bg-[var(--color-surface-0)] text-[var(--color-text-primary)] border border-[var(--color-border-strong)] rounded-[var(--radius-sm)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-coral-text)] focus:border-[var(--color-accent-coral-text)] transition-colors"
                />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-[var(--color-border)] p-5">
          {error && <p className="mb-3 text-sm text-[var(--color-danger)]">{error}</p>}
          {savedAt && !error && (
            <p className="mb-3 text-sm text-[var(--color-success)]">
              Saved.{hasPending && <span className="text-[var(--color-text-muted)]"> Syncing...</span>}
            </p>
          )}
          <Button type="button" onClick={handleSubmit} disabled={submitting || convertingHeic || compressing} className="w-full">
            {submitting ? "Saving..." : isEditing ? "Save Changes" : "Create Invitation"}
          </Button>
        </div>
      </aside>

      <main className="relative flex flex-1 items-center justify-center overflow-y-auto bg-[var(--color-surface-0)] p-10">
        <div
          className={`flex w-full max-w-xl overflow-hidden rounded-[var(--radius-md)] shadow-lg transition-shadow ${
            draggingOver ? "ring-4 ring-[var(--color-accent-coral-text)]" : ""
          }`}
          style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}` }}
          onDragOver={(e) => {
            // preventDefault on dragover is what makes an element a valid drop
            // target at all -- without it the browser just opens the file.
            e.preventDefault();
            setDraggingOver(true);
          }}
          onDragLeave={() => setDraggingOver(false)}
          onDrop={handleCanvasDrop}
        >
          <FabricCanvas
            ref={canvasRef}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            initialJSON={event?.design_config?.canvasJSON ?? null}
            backgroundColor={colors.background}
            fontPairId={fontPairId}
            textColor={colors.text}
            className="h-full w-full"
            onSelectionChange={handleSelectionChange}
            onChange={refreshLayers}
            onReady={syncPanels}
            onZoomChange={setZoom}
          />
        </div>

        {/* Floating over the canvas rather than in the sidebar: it's a view
            control, so it belongs with the thing it's controlling. */}
        <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-[var(--radius-full)] border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] px-1.5 py-1 shadow-lg">
          <ThemedTooltip label="Zoom out">
            <button
              type="button"
              onClick={() => canvasRef.current?.zoomBy(1 / 1.25)}
              disabled={zoom <= 1.001}
              aria-label="Zoom out"
              className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-full)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          </ThemedTooltip>
          <ThemedTooltip label="Reset to fit">
            <button
              type="button"
              onClick={() => canvasRef.current?.zoomToFit()}
              aria-label="Reset zoom to fit"
              className="min-w-12 rounded-[var(--radius-full)] px-1 text-[0.7rem] tabular-nums text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]"
            >
              {Math.round(zoom * 100)}%
            </button>
          </ThemedTooltip>
          <ThemedTooltip label="Zoom in" align="right">
            <button
              type="button"
              onClick={() => canvasRef.current?.zoomBy(1.25)}
              disabled={zoom >= 4.999}
              aria-label="Zoom in"
              className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-full)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <PlusIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          </ThemedTooltip>
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

"use client";

import { useState, FormEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, LayoutTemplate, Palette, PencilLine, ImagePlus, Check } from "lucide-react";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { isAcceptedImageType, isHeicFile, convertHeicToJpeg } from "@/lib/image-upload";
import { DESIGN_TEMPLATES } from "@/lib/design-templates";
import { DESIGN_PALETTES } from "@/lib/design-palettes";
import { DESIGN_FONT_PAIRS } from "@/lib/design-fonts";
import { DESIGN_ICONS } from "@/lib/design-icons";
import type { DesignConfig, SlotOffset } from "@/lib/design-types";
import type { DesignedCardFields } from "@/components/design/DesignedCardContent";
import { SlotEditor } from "@/components/design/SlotEditor";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

type Tab = "templates" | "style" | "content";

const TABS: { id: Tab; label: string; Icon: typeof LayoutTemplate }[] = [
  { id: "templates", label: "Templates", Icon: LayoutTemplate },
  { id: "style", label: "Style", Icon: Palette },
  { id: "content", label: "Content", Icon: PencilLine },
];

/**
 * "Design in our editor" -- a dedicated full-page workspace (sidebar tabs on
 * the left, the live card filling the right, Canva-style) rather than a
 * step inside the New Invitation modal. Replaced an earlier modal-step
 * version mid-build per explicit user feedback ("it should have a dedicated
 * page with sidebar options and the entire thing visible in the right, like
 * canva") -- see "custom rsvp card designer.md" section 7 for the
 * template-constrained-canvas approach this still implements underneath.
 */
export default function DesignPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("templates");

  const [templateId, setTemplateId] = useState(DESIGN_TEMPLATES[0].id);
  const [paletteId, setPaletteId] = useState(DESIGN_PALETTES[0].id);
  const [fontPairId, setFontPairId] = useState(DESIGN_FONT_PAIRS[0].id);
  const [iconId, setIconId] = useState<string | null>(null);
  const [slots, setSlots] = useState<Record<string, SlotOffset>>({});

  const [title, setTitle] = useState("");
  const [hostName, setHostName] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [location, setLocation] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [convertingHeic, setConvertingHeic] = useState(false);

  const template = DESIGN_TEMPLATES.find((t) => t.id === templateId) ?? DESIGN_TEMPLATES[0];
  const usesPhoto = "photo" in template.slots;

  const config: DesignConfig = { templateId, paletteId, fontPairId, iconId, slots };
  const fields: DesignedCardFields = {
    title,
    hostName: hostName || null,
    description: description || null,
    eventDate: eventDate || null,
    location: location || null,
    cardImageUrl: imageDataUrl,
  };

  // Changing templates resets slot overrides -- a saved drag/resize position
  // is only meaningful relative to the template it was made on (different
  // templates define different default boxes for the same slot id), so
  // carrying stale offsets across a template switch would silently misplace
  // content instead of using the new template's own sensible defaults.
  function handleTemplateChange(id: string) {
    setTemplateId(id);
    setSlots({});
  }

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
    setImageDataUrl(await fileToDataUrl(file));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setTab("content");
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
          designConfig: config,
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
    <div className="flex min-h-screen">
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
              className={`flex flex-1 flex-col items-center gap-1 px-2 py-3 text-xs font-medium transition-colors ${
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
          {tab === "templates" && (
            <div className="space-y-3">
              <p className="text-sm text-[var(--color-text-muted)]">Pick a starting layout — you can rearrange it in the canvas anytime.</p>
              {DESIGN_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleTemplateChange(t.id)}
                  className={`flex w-full flex-col gap-1 rounded-[var(--radius-md)] border-2 p-3 text-left transition-colors ${
                    templateId === t.id
                      ? "border-[var(--color-accent-coral-text)] bg-[var(--color-surface-2)]"
                      : "border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)]"
                  }`}
                >
                  <span className="text-sm font-semibold text-[var(--color-text-primary)]">{t.name}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">{t.description}</span>
                </button>
              ))}
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
                <div className="space-y-2">
                  {DESIGN_FONT_PAIRS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFontPairId(f.id)}
                      className={`w-full rounded-[var(--radius-sm)] border-2 px-3 py-2 text-left transition-colors ${
                        fontPairId === f.id ? "border-[var(--color-accent-coral-text)]" : "border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)]"
                      }`}
                    >
                      <span className="block text-base font-semibold text-[var(--color-text-primary)]" style={{ fontFamily: f.displayVar }}>
                        {f.name}
                      </span>
                      <span className="block text-xs text-[var(--color-text-muted)]" style={{ fontFamily: f.bodyVar }}>
                        Aa Bb Cc
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label>Decorative icon (optional)</Label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setIconId(null)}
                    className={`flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] border-2 text-[0.65rem] ${
                      iconId === null ? "border-[var(--color-accent-coral-text)]" : "border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)]"
                    }`}
                    title="None"
                  >
                    None
                  </button>
                  {DESIGN_ICONS.map(({ id, name, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setIconId(id)}
                      title={name}
                      className={`flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] border-2 transition-colors ${
                        iconId === id ? "border-[var(--color-accent-coral-text)]" : "border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)]"
                      }`}
                    >
                      <Icon className="h-5 w-5 text-[var(--color-text-primary)]" strokeWidth={1.75} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "content" && (
            <form onSubmit={handleSubmit} className="space-y-4">
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
              {usesPhoto && (
                <div>
                  <Label htmlFor="card-image">Photo (optional)</Label>
                  <label
                    htmlFor="card-image"
                    className="flex flex-col items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border-2 border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-0)] p-3 cursor-pointer hover:border-[var(--color-accent-coral-text)] transition-colors"
                  >
                    {convertingHeic ? (
                      <span className="text-sm text-[var(--color-text-muted)]">Converting HEIC photo...</span>
                    ) : imageDataUrl ? (
                      <span className="flex items-center gap-1.5 text-sm text-[var(--color-accent-sage)]">
                        <Check className="h-4 w-4" strokeWidth={2} /> Photo added
                      </span>
                    ) : (
                      <>
                        <ImagePlus className="h-6 w-6 text-[var(--color-text-muted)]" strokeWidth={1.5} />
                        <span className="text-xs text-[var(--color-text-muted)]">Click to upload</span>
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
            </form>
          )}
        </div>

        <div className="border-t border-[var(--color-border)] p-5">
          {error && <p className="mb-3 text-sm text-[var(--color-danger)]">{error}</p>}
          <Button type="button" onClick={handleSubmit} disabled={submitting || convertingHeic} className="w-full">
            {submitting ? "Creating..." : "Create Invitation"}
          </Button>
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center bg-[var(--color-surface-0)] p-10">
        <div className="w-full max-w-md">
          <SlotEditor
            config={config}
            fields={fields}
            onSlotChange={(slotId, offset) => setSlots((prev) => ({ ...prev, [slotId]: offset }))}
          />
        </div>
      </main>
    </div>
  );
}

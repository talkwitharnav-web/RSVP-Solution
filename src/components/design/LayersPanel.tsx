"use client";

import { ChevronUp, ChevronDown, Trash2, Type, Image as ImageIcon, Sparkles, Shapes } from "lucide-react";
import type { CanvasLayerKind, CanvasLayerSummary } from "./FabricCanvas";

const KIND_ICON: Record<CanvasLayerKind, typeof Type> = {
  text: Type,
  image: ImageIcon,
  icon: Sparkles,
  decoration: Shapes,
  other: Shapes,
};

/**
 * Plain display list -- FabricCanvas's getLayers() is a pull snapshot, not a
 * live subscription, so the parent page re-reads it on every onChange/
 * onSelectionChange and passes the fresh array down here as a prop. Ordered
 * front-first (matches getLayers()) since that's how a layers list is
 * normally read -- the top row is what's drawn on top.
 */
export function LayersPanel({
  layers,
  selectedLayerId,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  layers: CanvasLayerSummary[];
  selectedLayerId: string | null;
  onSelect: (layerId: string) => void;
  onMoveUp: (layerId: string, currentFrontIndex: number) => void;
  onMoveDown: (layerId: string, currentFrontIndex: number) => void;
  onDelete: (layerId: string) => void;
}) {
  if (layers.length === 0) {
    return (
      <p className="text-xs text-[var(--color-text-muted)]">
        Nothing on the card yet — add text, an image, or an icon to see it listed here.
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {layers.map((layer, index) => {
        const Icon = KIND_ICON[layer.kind];
        const isSelected = layer.layerId === selectedLayerId;
        return (
          <li
            key={layer.layerId}
            className={`flex items-center gap-2 rounded-[var(--radius-sm)] border px-2 py-1.5 transition-colors ${
              isSelected
                ? "border-[var(--color-accent-coral-text)] bg-[var(--color-surface-2)]"
                : "border-transparent hover:bg-[var(--color-surface-2)]"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(layer.layerId)}
              className="flex flex-1 items-center gap-2 text-left text-sm text-[var(--color-text-primary)] min-w-0"
            >
              <Icon className="h-4 w-4 flex-shrink-0 text-[var(--color-text-muted)]" strokeWidth={2} />
              <span className="truncate">{layer.label}</span>
            </button>
            <button
              type="button"
              onClick={() => onMoveUp(layer.layerId, index)}
              disabled={index === 0}
              title="Bring forward"
              className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-0)] disabled:opacity-30"
            >
              <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => onMoveDown(layer.layerId, index)}
              disabled={index === layers.length - 1}
              title="Send backward"
              className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-0)] disabled:opacity-30"
            >
              <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => onDelete(layer.layerId)}
              title="Delete"
              className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-danger)] hover:bg-[var(--color-surface-0)]"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

"use client";

import { ChevronUp, ChevronDown, Loader2, ImageOff } from "lucide-react";
import { Button } from "@client/components/ui/button";
import { Card, CardContent } from "@client/components/ui/card";
import { cn } from "@server/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Slide {
  id: string;
  imageUrl: string;
  headline: string;
  order: number;
}

interface CarouselEditorProps {
  slides: Slide[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  onHeadlineChange?: (slideId: string, newHeadline: string) => void;
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true for empty strings or base64 data URLs that are still loading/placeholder. */
function isPlaceholderImage(imageUrl: string): boolean {
  return !imageUrl || imageUrl.trim() === "";
}

// ---------------------------------------------------------------------------
// SlideCard
// ---------------------------------------------------------------------------

interface SlideCardProps {
  slide: Slide;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onHeadlineChange?: (slideId: string, newHeadline: string) => void;
}

function SlideCard({
  slide,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onHeadlineChange,
}: SlideCardProps) {
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const hasPlaceholder = isPlaceholderImage(slide.imageUrl);

  return (
    <Card className="overflow-hidden group relative">
      {/* Slide counter badge */}
      <span
        className="absolute top-2 left-2 z-10 inline-flex items-center rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white shadow"
        aria-label={`Slide ${index + 1} de ${total}`}
      >
        {index + 1}/{total}
      </span>

      {/* Reorder controls */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 bg-white/90 backdrop-blur-sm shadow-sm hover:bg-white disabled:opacity-40"
          onClick={onMoveUp}
          disabled={isFirst}
          aria-label={`Mover slide ${index + 1} para cima`}
          title="Mover para cima"
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 bg-white/90 backdrop-blur-sm shadow-sm hover:bg-white disabled:opacity-40"
          onClick={onMoveDown}
          disabled={isLast}
          aria-label={`Mover slide ${index + 1} para baixo`}
          title="Mover para baixo"
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>

      {/* Image area */}
      <div className="aspect-square w-full bg-gray-100 flex items-center justify-center overflow-hidden">
        {hasPlaceholder ? (
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <ImageOff className="h-8 w-8" />
            <span className="text-xs">Sem imagem</span>
          </div>
        ) : (
          <img
            src={slide.imageUrl}
            alt={slide.headline || `Slide ${index + 1}`}
            className="h-full w-full object-cover"
          />
        )}
      </div>

      {/* Headline */}
      <CardContent className="p-3">
        {onHeadlineChange ? (
          <input
            type="text"
            value={slide.headline}
            maxLength={60}
            placeholder="Título do slide…"
            onChange={(e) => onHeadlineChange(slide.id, e.target.value)}
            className={cn(
              "w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900",
              "placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
              "transition-colors"
            )}
            aria-label={`Título do slide ${index + 1}`}
          />
        ) : (
          <p className="text-sm font-medium text-gray-800 truncate" title={slide.headline}>
            {slide.headline || <span className="text-gray-400 italic">Sem título</span>}
          </p>
        )}
        {onHeadlineChange && (
          <p className="mt-1 text-right text-xs text-gray-400">
            {slide.headline.length}/60
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// CarouselEditor
// ---------------------------------------------------------------------------

export function CarouselEditor({
  slides,
  onReorder,
  onHeadlineChange,
  loading = false,
}: CarouselEditorProps) {
  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        <span className="ml-2 text-sm text-gray-500">Carregando slides…</span>
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (slides.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
          <ImageOff className="h-10 w-10 text-gray-300" />
          <p className="text-gray-500 font-medium">Nenhum slide disponível</p>
          <p className="text-gray-400 text-sm text-center">
            Adicione slides ao carrossel para começar.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Grid ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3"
      role="list"
      aria-label="Slides do carrossel"
    >
      {slides.map((slide, index) => (
        <div key={slide.id} role="listitem">
          <SlideCard
            slide={slide}
            index={index}
            total={slides.length}
            onMoveUp={() => onReorder(index, index - 1)}
            onMoveDown={() => onReorder(index, index + 1)}
            onHeadlineChange={onHeadlineChange}
          />
        </div>
      ))}
    </div>
  );
}

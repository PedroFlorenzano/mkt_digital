"use client";

import { Check, Loader2 } from "lucide-react";
import { Button } from "@client/components/ui/button";
import { cn } from "@server/lib/utils";

interface VariationsPanelProps {
  images: string[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onLoadMore: () => void;
  loading?: boolean;
  title?: string;
}

export function VariationsPanel({
  images,
  selectedIndex,
  onSelect,
  onLoadMore,
  loading = false,
  title = "Escolha a imagem",
}: VariationsPanelProps) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <span className="text-sm text-gray-500">
          {images.length} {images.length === 1 ? "variação disponível" : "variações disponíveis"}
        </span>
      </div>

      {/* Image grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {images.map((src, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            className={cn(
              "relative rounded-xl overflow-hidden border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
              selectedIndex === i
                ? "border-blue-600 ring-2 ring-blue-200"
                : "border-gray-200 hover:border-gray-300"
            )}
          >
            <div className="relative w-full aspect-square bg-gray-100">
              <img
                src={src}
                alt={`Variação ${i + 1}`}
                className="w-full h-full object-cover"
              />

              {/* Selected overlay with checkmark */}
              {selectedIndex === i && (
                <div className="absolute inset-0 bg-blue-600/20 flex items-center justify-center">
                  <div className="bg-blue-600 rounded-full p-1.5 shadow-md">
                    <Check className="h-4 w-4 text-white" />
                  </div>
                </div>
              )}
            </div>

            {/* Label */}
            <div className="p-2 text-center bg-white">
              <span className="text-xs font-medium text-gray-600">
                Variação {i + 1}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Load more button */}
      <div className="flex justify-center pt-1">
        <Button
          variant="outline"
          onClick={onLoadMore}
          disabled={loading}
          className="gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Gerando variações...
            </>
          ) : (
            "Gerar mais variações"
          )}
        </Button>
      </div>
    </div>
  );
}

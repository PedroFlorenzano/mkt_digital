"use client";

import { useState } from "react";
import { Info, Copy, Check, Loader2 } from "lucide-react";
import { Button } from "@client/components/ui/button";
import { Card, CardContent } from "@client/components/ui/card";
import { cn } from "@server/lib/utils";

interface BioSuggestion {
  text: string;
  charCount: number;
}

const BIO_MAX_CHARS = 150;

export function BioGenerator() {
  const [suggestions, setSuggestions] = useState<BioSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  async function handleSuggest() {
    setLoading(true);
    setError(null);
    setSuggestions([]);

    try {
      const res = await fetch("/api/instagram/bio", { method: "POST" });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Erro ${res.status} ao gerar sugestões de bio.`);
      }

      const data: { suggestions: BioSuggestion[] } = await res.json();
      setSuggestions(data.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado ao gerar sugestões de bio.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // Clipboard API unavailable — silently ignore
    }
  }

  return (
    <div className="space-y-6">
      {/* Trigger */}
      <div className="flex items-center gap-4">
        <Button
          onClick={handleSuggest}
          disabled={loading}
          className="gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Gerando...
            </>
          ) : (
            "Sugerir Bio"
          )}
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <span className="mt-0.5 shrink-0">⚠️</span>
          <p>{error}</p>
        </div>
      )}

      {/* Bio suggestion cards */}
      {suggestions.length > 0 && (
        <div className="space-y-4">
          {/* Persistent info banner */}
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              ⚠️ A bio não pode ser editada automaticamente pela plataforma. Copie e cole manualmente no Instagram.
            </p>
          </div>

          {/* Cards */}
          {suggestions.map((suggestion, index) => (
            <Card key={index}>
              <CardContent className="pt-4">
                <div className="flex flex-col gap-3">
                  {/* Bio text */}
                  <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
                    {suggestion.text}
                  </p>

                  {/* Footer row: char count badge + copy button */}
                  <div className="flex items-center justify-between">
                    {/* Character count badge */}
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                        suggestion.charCount <= BIO_MAX_CHARS
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      )}
                    >
                      {suggestion.charCount}/{BIO_MAX_CHARS}
                    </span>

                    {/* Copy button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(suggestion.text, index)}
                      className="gap-1.5"
                      aria-label={`Copiar bio ${index + 1}`}
                    >
                      {copiedIndex === index ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-green-600" />
                          <span className="text-green-600">Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copiar
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

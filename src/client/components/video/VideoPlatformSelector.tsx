"use client";

import { AlertCircle, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";
import { cn } from "@server/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const VIDEO_PLATFORMS = [
  {
    id: "instagram",
    label: "Instagram Reels",
    emoji: "📸",
    color: "text-pink-500",
    activeBorder: "border-pink-500",
    activeBg: "bg-pink-50",
  },
  {
    id: "tiktok",
    label: "TikTok",
    emoji: "🎵",
    color: "text-gray-900",
    activeBorder: "border-gray-700",
    activeBg: "bg-gray-100",
  },
  {
    id: "youtube",
    label: "YouTube Shorts",
    emoji: "▶️",
    color: "text-red-600",
    activeBorder: "border-red-500",
    activeBg: "bg-red-50",
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface VideoPlatformSelectorProps {
  platforms: string[];
  setPlatforms: (platforms: string[]) => void;
  /** When provided, used to determine if a platform has a connected account.
   *  When undefined, the "not connected" warning is suppressed entirely. */
  connectedPlatforms?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function VideoPlatformSelector({
  platforms,
  setPlatforms,
  connectedPlatforms,
}: VideoPlatformSelectorProps) {
  function togglePlatform(id: string) {
    if (platforms.includes(id)) {
      // Prevent deselecting the last platform
      if (platforms.length > 1) {
        setPlatforms(platforms.filter((p) => p !== id));
      }
    } else {
      setPlatforms([...platforms, id]);
    }
  }

  const tiktokSelected = platforms.includes("tiktok");
  const youtubeSelected = platforms.includes("youtube");

  // Only show "not connected" warnings when connectedPlatforms is explicitly provided
  const showTikTokNotConnected =
    connectedPlatforms !== undefined &&
    tiktokSelected &&
    !connectedPlatforms.includes("tiktok");
  const showYouTubeNotConnected =
    connectedPlatforms !== undefined &&
    youtubeSelected &&
    !connectedPlatforms.includes("youtube");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Plataformas de vídeo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-1 gap-2">
          {VIDEO_PLATFORMS.map((p) => {
            const selected = platforms.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePlatform(p.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all",
                  selected
                    ? `${p.activeBorder} ${p.activeBg} ${p.color}`
                    : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50",
                )}
              >
                <span className="text-base leading-none shrink-0">{p.emoji}</span>
                <span className="flex-1 text-left">{p.label}</span>
                {selected && <Check className="h-3.5 w-3.5 ml-auto shrink-0" />}
              </button>
            );
          })}
        </div>

        {/* TikTok warning — only visible while TikTok is selected */}
        {tiktokSelected && (
          <div className="flex items-start gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 text-gray-500 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-600 leading-snug">
              <strong>TikTok:</strong> a publicação requer app aprovado no Developer Portal da plataforma.
            </p>
          </div>
        )}

        {/* TikTok not-connected warning */}
        {showTikTokNotConnected && (
          <div className="flex items-start gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 text-yellow-600 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-700 leading-snug">
              <strong>TikTok:</strong> publicação requer conta conectada. O post será salvo como rascunho.
            </p>
          </div>
        )}

        {/* YouTube not-connected warning */}
        {showYouTubeNotConnected && (
          <div className="flex items-start gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 text-yellow-600 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-700 leading-snug">
              <strong>YouTube Shorts:</strong> publicação requer conta conectada. O post será salvo como rascunho.
            </p>
          </div>
        )}

        {/* Post count — only visible when 2+ platforms are selected */}
        {platforms.length >= 2 && (
          <p className="text-xs text-gray-500">
            {platforms.length} posts serão criados (1 post por plataforma selecionada)
          </p>
        )}
      </CardContent>
    </Card>
  );
}

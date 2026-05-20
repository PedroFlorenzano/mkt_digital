"use client";

import { useState } from "react";
import { Wand2, Sparkles, Send, Check } from "lucide-react";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";
import { VideoWizard } from "@client/components/video/VideoWizard";
import { ReelCaptionWizard } from "@client/components/video/ReelCaptionWizard";
import { ReelUploadPublish } from "@client/components/video/ReelUploadPublish";
import { cn } from "@server/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type VideoCreationMode = "ai-pipeline" | "upload-caption" | "upload-publish";

// ─────────────────────────────────────────────────────────────────────────────
// Mode definitions
// ─────────────────────────────────────────────────────────────────────────────

const MODES: Array<{
  id: VideoCreationMode;
  label: string;
  description: string;
  icon: React.ElementType;
  activeBorder: string;
  activeBg: string;
  activeIcon: string;
  activeLabel: string;
  checkColor: string;
}> = [
  {
    id: "ai-pipeline",
    label: "IA Avançada",
    description: "A IA transforma seu vídeo bruto em um reel profissional com narração, cortes e estilo.",
    icon: Wand2,
    activeBorder: "border-blue-600",
    activeBg: "bg-blue-50",
    activeIcon: "bg-blue-600",
    activeLabel: "text-blue-800",
    checkColor: "text-blue-600",
  },
  {
    id: "upload-caption",
    label: "Upload + Legenda IA",
    description: "Envie seu vídeo pronto e a IA gera a legenda e hashtags ideais para cada plataforma.",
    icon: Sparkles,
    activeBorder: "border-purple-600",
    activeBg: "bg-purple-50",
    activeIcon: "bg-purple-600",
    activeLabel: "text-purple-800",
    checkColor: "text-purple-600",
  },
  {
    id: "upload-publish",
    label: "Upload + Publicar",
    description: "Você já tem o vídeo e a legenda. Só escolher as plataformas e agendar.",
    icon: Send,
    activeBorder: "border-green-600",
    activeBg: "bg-green-50",
    activeIcon: "bg-green-600",
    activeLabel: "text-green-800",
    checkColor: "text-green-600",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function NewVideoPage() {
  const [activeMode, setActiveMode] = useState<VideoCreationMode>("ai-pipeline");

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto py-4">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Novo Vídeo</h1>
          <p className="text-sm text-gray-500 mt-1">
            Escolha como prefere criar seu reel.
          </p>
        </div>

        {/* Mode selector */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {MODES.map((mode) => {
            const Icon = mode.icon;
            const isActive = activeMode === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => setActiveMode(mode.id)}
                className={cn(
                  "flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all",
                  isActive
                    ? `${mode.activeBorder} ${mode.activeBg}`
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50",
                )}
              >
                <div className="flex items-center gap-2 w-full">
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
                      isActive ? mode.activeIcon : "bg-gray-100",
                    )}
                  >
                    <Icon
                      className={cn("h-4 w-4", isActive ? "text-white" : "text-gray-500")}
                    />
                  </div>
                  <span
                    className={cn(
                      "font-semibold text-sm",
                      isActive ? mode.activeLabel : "text-gray-700",
                    )}
                  >
                    {mode.label}
                  </span>
                  {isActive && (
                    <Check className={cn("h-4 w-4 ml-auto shrink-0", mode.checkColor)} />
                  )}
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {mode.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* Active mode component — key resets internal state on mode change */}
        {activeMode === "ai-pipeline" && <VideoWizard key="ai-pipeline" />}
        {activeMode === "upload-caption" && <ReelCaptionWizard key="upload-caption" />}
        {activeMode === "upload-publish" && <ReelUploadPublish key="upload-publish" />}
      </div>
    </DashboardLayout>
  );
}

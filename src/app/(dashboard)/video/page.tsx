"use client";

import { useState } from "react";
import Link from "next/link";
import { PlusCircle, Video } from "lucide-react";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";
import { Button } from "@client/components/ui/button";
import { Separator } from "@client/components/ui/separator";
import { VideoGalleryGrid } from "@client/components/video/VideoGalleryGrid";
import { ReelGallerySection } from "@client/components/video/ReelGallerySection";
import { cn } from "@server/lib/utils";

type VideoTab = "ai-jobs" | "reels";

export default function VideoPage() {
  const [activeTab, setActiveTab] = useState<VideoTab>("ai-jobs");

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
            <Video className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Vídeos com IA</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Transforme vídeos do seu negócio em reels profissionais
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href="/video/new">
            <PlusCircle className="h-4 w-4" />
            Novo Vídeo
          </Link>
        </Button>
      </div>

      <Separator className="mb-6" />

      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { key: "ai-jobs" as VideoTab, label: "Vídeos com IA" },
          { key: "reels" as VideoTab, label: "Reels Agendados" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "ai-jobs" ? <VideoGalleryGrid /> : <ReelGallerySection />}
    </DashboardLayout>
  );
}

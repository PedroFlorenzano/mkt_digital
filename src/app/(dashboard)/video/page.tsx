"use client";

import Link from "next/link";
import { PlusCircle, Video } from "lucide-react";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";
import { Button } from "@client/components/ui/button";
import { Separator } from "@client/components/ui/separator";
import { VideoGalleryGrid } from "@client/components/video/VideoGalleryGrid";

export default function VideoPage() {
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

      <VideoGalleryGrid />
    </DashboardLayout>
  );
}

"use client";

import Link from "next/link";
import { Badge } from "@client/components/ui/badge";
import { Card, CardContent } from "@client/components/ui/card";
import { Video, Clock, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

interface VideoCardProps {
  id: string;
  status: string;
  platform: string;
  targetDuration: number;
  creditDeducted: boolean;
  createdAt: string;
  outputResolution?: string | null;
}

const platformLabels: Record<string, string> = {
  instagram_reels: "Instagram Reels",
  tiktok: "TikTok",
  youtube_shorts: "YouTube Shorts",
};

const statusConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  completed: { label: "Concluído", icon: CheckCircle2, color: "bg-green-100 text-green-700" },
  error: { label: "Erro", icon: AlertCircle, color: "bg-red-100 text-red-700" },
  queued: { label: "Na fila", icon: Clock, color: "bg-gray-100 text-gray-600" },
};

export function VideoCard({
  id,
  status,
  platform,
  targetDuration,
  creditDeducted,
  createdAt,
  outputResolution,
}: VideoCardProps) {
  const isCompleted = status === "completed";
  const isProcessing = !["completed", "error"].includes(status);
  const cfg = statusConfig[status] ?? statusConfig.queued!;
  const Icon = isProcessing ? Loader2 : cfg.icon;

  const content = (
    <Card className={`hover:shadow-md transition-shadow ${isCompleted ? "cursor-pointer" : ""}`}>
      {/* Thumbnail placeholder */}
      <div className="aspect-[9/16] bg-gradient-to-br from-blue-900 to-indigo-900 rounded-t-xl flex items-center justify-center relative overflow-hidden max-h-48">
        <Video className="h-12 w-12 text-white/30" />
        <div className="absolute top-2 right-2">
          <Badge className={cfg.color}>
            <Icon className={`h-3 w-3 mr-1 ${isProcessing ? "animate-spin" : ""}`} />
            {isProcessing ? "Processando..." : cfg.label}
          </Badge>
        </div>
        <div className="absolute bottom-2 left-2">
          <Badge className="bg-black/50 text-white border-transparent text-xs">
            {targetDuration}s
          </Badge>
        </div>
      </div>

      <CardContent className="pt-3 pb-3 space-y-1">
        <p className="text-sm font-medium text-gray-900 truncate">
          {platformLabels[platform] ?? platform}
        </p>
        <p className="text-xs text-gray-400">
          {new Date(createdAt).toLocaleDateString("pt-BR")}
        </p>
        {outputResolution && (
          <p className="text-xs text-gray-400">{outputResolution}</p>
        )}
        {creditDeducted && (
          <p className="text-xs text-blue-500">1 crédito consumido</p>
        )}
      </CardContent>
    </Card>
  );

  if (isCompleted) {
    return <Link href={`/video/${id}`}>{content}</Link>;
  }

  if (isProcessing) {
    return <Link href={`/video/${id}`}>{content}</Link>;
  }

  return content;
}

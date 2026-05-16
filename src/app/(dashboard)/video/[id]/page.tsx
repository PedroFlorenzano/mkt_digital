"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";
import { StepProgressList } from "@client/components/video/StepProgressList";
import { VideoPlayer } from "@client/components/video/VideoPlayer";
import { Button } from "@client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";
import { Badge } from "@client/components/ui/badge";
import {
  Download,
  AlertCircle,
  RefreshCw,
  ArrowLeft,
  Clock,
} from "lucide-react";

interface VideoJobStatus {
  id: string;
  status: string;
  progress: number;
  platform: string;
  targetDuration: number;
  errorMessage?: string;
  stepDurations?: Array<{ step: string; durationMs: number }>;
  estimatedRemainingSeconds?: number;
  outputDurationSeconds?: number;
  outputFileSizeBytes?: number;
  outputResolution?: string;
  creditDeducted?: boolean;
  createdAt: string;
  completedAt?: string;
}

function formatSize(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram_reels: "Instagram Reels",
  tiktok: "TikTok",
  youtube_shorts: "YouTube Shorts",
};

export default function VideoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;

  const [job, setJob] = useState<VideoJobStatus | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Polling
  useEffect(() => {
    if (!jobId) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/video/jobs/${jobId}`);
        if (!res.ok) return;
        const data = await res.json() as VideoJobStatus;
        setJob(data);
      } catch { /* silent */ }
    };

    void poll();
    const interval = setInterval(() => {
      void poll().then(() => {
        const status = (job?.status ?? "");
        if (status === "completed" || status === "error") {
          clearInterval(interval);
        }
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [jobId, job?.status]);

  const handleDownload = async () => {
    if (downloadUrl) {
      window.open(downloadUrl, "_blank");
      return;
    }
    setDownloading(true);
    try {
      const res = await fetch(`/api/video/jobs/${jobId}/download`);
      if (!res.ok) throw new Error("Falha ao gerar link.");
      const data = await res.json() as { downloadUrl: string };
      setDownloadUrl(data.downloadUrl);
      window.open(data.downloadUrl, "_blank");
    } catch {
      alert("Não foi possível gerar o link de download.");
    } finally {
      setDownloading(false);
    }
  };

  if (!job) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-48">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  const isDone = job.status === "completed";
  const isError = job.status === "error";
  const isProcessing = !isDone && !isError;

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href="/video"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
          </Button>
          <h1 className="text-xl font-bold text-gray-900">
            {PLATFORM_LABELS[job.platform] ?? job.platform} · {job.targetDuration}s
          </h1>
          <Badge
            className={
              isDone ? "bg-green-100 text-green-700"
              : isError ? "bg-red-100 text-red-700"
              : "bg-blue-100 text-blue-700"
            }
          >
            {isDone ? "Concluído" : isError ? "Erro" : "Processando..."}
          </Badge>
        </div>

        {/* Progress */}
        {isProcessing && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Gerando seu vídeo...</CardTitle>
              {job.estimatedRemainingSeconds && (
                <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                  <Clock className="h-4 w-4" />
                  Aproximadamente {Math.ceil(job.estimatedRemainingSeconds / 60)} min restantes
                </p>
              )}
            </CardHeader>
            <CardContent>
              {/* Progress bar */}
              <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
              <StepProgressList
                currentStatus={job.status}
                stepDurations={job.stepDurations}
              />
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {isError && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="flex items-start gap-3 pt-6">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-700">Falha na geração</p>
                <p className="text-sm text-red-600 mt-1">{job.errorMessage}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => router.push("/video/new")}
                >
                  <RefreshCw className="h-4 w-4" /> Tentar novamente
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Video player */}
        {isDone && downloadUrl && (
          <VideoPlayer src={downloadUrl} resolution={job.outputResolution ?? undefined} />
        )}

        {/* Metadata & Download */}
        {isDone && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Detalhes do vídeo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Row label="Duração" value={`${job.outputDurationSeconds ?? job.targetDuration}s`} />
              <Row label="Resolução" value={job.outputResolution ?? "—"} />
              <Row label="Tamanho" value={formatSize(job.outputFileSizeBytes)} />
              <Row label="Gerado em" value={job.completedAt ? new Date(job.completedAt).toLocaleString("pt-BR") : "—"} />
              <Row label="Crédito" value={job.creditDeducted ? "1 crédito consumido" : "Não consumido"} />
            </CardContent>
          </Card>
        )}

        {isDone && (
          <Button onClick={handleDownload} disabled={downloading} className="w-full">
            {downloading ? (
              <><RefreshCw className="h-4 w-4 animate-spin" /> Preparando download...</>
            ) : (
              <><Download className="h-4 w-4" /> Baixar vídeo</>
            )}
          </Button>
        )}
      </div>
    </DashboardLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-900 font-medium">{value}</span>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { VideoCard } from "@client/components/video/VideoCard";
import { Button } from "@client/components/ui/button";
import { Loader2, VideoOff } from "lucide-react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface VideoJob {
  id: string;
  status: string;
  platform: string;
  targetDuration: number;
  creditDeducted: boolean;
  createdAt: string;
  outputResolution: string | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface GalleryResponse {
  jobs: VideoJob[];
  pagination: Pagination;
}

export function VideoGalleryGrid() {
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 12, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/video/jobs?page=${page}&pageSize=12`)
      .then((r) => r.json() as Promise<GalleryResponse>)
      .then((data) => {
        setJobs(data.jobs ?? []);
        setPagination(data.pagination);
        setLoading(false);
      })
      .catch(() => {
        setError("Falha ao carregar vídeos");
        setLoading(false);
      });
  }, [page]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-500 text-center py-8">{error}</p>;
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <VideoOff className="h-12 w-12 text-gray-300" />
        <p className="text-gray-500 font-medium">Nenhum vídeo gerado ainda</p>
        <p className="text-gray-400 text-sm">Crie seu primeiro reel com IA clicando em &quot;Novo Vídeo&quot;.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {jobs.map((job) => (
          <VideoCard key={job.id} {...job} />
        ))}
      </div>

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Página {pagination.page} de {pagination.totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page === pagination.totalPages}>
              Próxima <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Video,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Send,
  Loader2,
  FilmIcon,
  ChevronLeft,
  ChevronRight,
  FileText,
  X,
  Pencil,
  XCircle,
  Eye,
  Calendar,
} from "lucide-react";
import { Card, CardContent } from "@client/components/ui/card";
import { Badge } from "@client/components/ui/badge";
import { Button } from "@client/components/ui/button";
import { cn } from "@server/lib/utils";

interface ReelPost {
  id: string;
  platform: string;
  content: string | null;
  imageUrl: string | null; // video URL
  status: string; // draft | scheduled | published
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  format: string | null;
}

interface PaginatedResponse {
  data: ReelPost[];
  total: number;
  page: number;
  pageSize: number;
  hasNextPage: boolean;
}

interface CardError {
  postId: string;
  message: string;
}

const PAGE_SIZE = 12;

const statusConfig: Record<
  string,
  {
    label: string;
    variant: "secondary" | "warning" | "success" | "default";
    icon: React.ElementType;
  }
> = {
  draft: { label: "Rascunho", variant: "secondary", icon: FileText },
  scheduled: { label: "Agendado", variant: "warning", icon: Clock },
  published: { label: "Publicado", variant: "success", icon: CheckCircle2 },
};

const platformLabels: Record<string, string> = {
  instagram: "Instagram Reels",
  tiktok: "TikTok",
  youtube: "YouTube Shorts",
};

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton card
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <Card className="overflow-hidden animate-pulse">
      <div className="h-40 bg-gray-200" />
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-4 w-20 bg-gray-200 rounded" />
          <div className="h-5 w-16 bg-gray-200 rounded-full" />
        </div>
        <div className="space-y-1.5">
          <div className="h-3 w-full bg-gray-200 rounded" />
          <div className="h-3 w-3/4 bg-gray-200 rounded" />
        </div>
        <div className="h-3 w-24 bg-gray-200 rounded" />
        <div className="flex gap-2 pt-1">
          <div className="h-7 w-24 bg-gray-200 rounded" />
          <div className="h-7 w-16 bg-gray-200 rounded" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function ReelGallerySection() {
  const [reels, setReels] = useState<ReelPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [cardErrors, setCardErrors] = useState<CardError[]>([]);
  const [publishingIds, setPublishingIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // ── Modal state ────────────────────────────────────────────────────────────
  const [selectedReel, setSelectedReel] = useState<ReelPost | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [modalSaving, setModalSaving] = useState(false);
  const [modalSaveError, setModalSaveError] = useState("");
  const [modalPublishing, setModalPublishing] = useState(false);
  const [modalPublishResult, setModalPublishResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchReels = useCallback(async (targetPage: number) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/posts?format=reel&page=${targetPage}&pageSize=${PAGE_SIZE}`
      );
      if (!res.ok) throw new Error("Falha ao carregar reels");
      const data = (await res.json()) as PaginatedResponse;
      setReels(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setReels([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReels(page);
  }, [page, fetchReels]);

  // ── Card error helpers ─────────────────────────────────────────────────────

  function clearCardError(postId: string) {
    setCardErrors((prev) => prev.filter((e) => e.postId !== postId));
  }

  function setCardError(postId: string, message: string) {
    setCardErrors((prev) => [
      ...prev.filter((e) => e.postId !== postId),
      { postId, message },
    ]);
  }

  // ── Modal handlers ─────────────────────────────────────────────────────────

  function openModal(reel: ReelPost) {
    setSelectedReel(reel);
    setEditMode(false);
    setEditContent(reel.content ?? "");
    setModalSaveError("");
    setModalPublishResult(null);
  }

  function closeModal() {
    setSelectedReel(null);
    setEditMode(false);
    setModalSaveError("");
    setModalPublishResult(null);
  }

  async function handleModalSaveEdit() {
    if (!selectedReel) return;
    setModalSaving(true);
    setModalSaveError("");
    try {
      const res = await fetch(`/api/posts/${selectedReel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setModalSaveError(d.error ?? "Erro ao salvar");
        return;
      }
      const updated = (await res.json()) as ReelPost;
      // Update in the grid
      setReels((prev) =>
        prev.map((r) =>
          r.id === updated.id ? { ...r, content: updated.content } : r
        )
      );
      // Update in the modal
      setSelectedReel((prev) =>
        prev ? { ...prev, content: updated.content } : null
      );
      setEditMode(false);
    } finally {
      setModalSaving(false);
    }
  }

  async function handleModalPublish() {
    if (!selectedReel) return;
    setModalPublishing(true);
    setModalPublishResult(null);
    try {
      const res = await fetch("/api/social/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: selectedReel.id }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (data.success) {
        const now = new Date().toISOString();
        setReels((prev) =>
          prev.map((r) =>
            r.id === selectedReel.id
              ? { ...r, status: "published", publishedAt: now }
              : r
          )
        );
        setSelectedReel((prev) =>
          prev ? { ...prev, status: "published", publishedAt: now } : null
        );
        setModalPublishResult({ success: true, message: "Reel publicado com sucesso!" });
      } else {
        setModalPublishResult({
          success: false,
          message: data.error ?? "Falha ao publicar",
        });
      }
    } catch {
      setModalPublishResult({ success: false, message: "Erro de conexão" });
    } finally {
      setModalPublishing(false);
    }
  }

  async function handleModalDelete() {
    if (!selectedReel) return;
    if (!confirm("Excluir este reel?")) return;
    const res = await fetch(`/api/posts?id=${selectedReel.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setReels((prev) => prev.filter((r) => r.id !== selectedReel.id));
      setTotal((prev) => prev - 1);
      closeModal();
    }
  }

  // ── Card-level publish/delete (unchanged behavior) ─────────────────────────

  async function handlePublish(post: ReelPost) {
    if (post.status === "published") return;
    clearCardError(post.id);
    setPublishingIds((prev) => new Set(prev).add(post.id));
    try {
      const res = await fetch("/api/social/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (data.success) {
        setReels((prev) =>
          prev.map((r) =>
            r.id === post.id
              ? { ...r, status: "published", publishedAt: new Date().toISOString() }
              : r
          )
        );
      } else {
        setCardError(post.id, data.error ?? "Falha ao publicar");
      }
    } catch {
      setCardError(post.id, "Erro de conexão ao publicar");
    } finally {
      setPublishingIds((prev) => {
        const next = new Set(prev);
        next.delete(post.id);
        return next;
      });
    }
  }

  async function handleDelete(post: ReelPost) {
    if (
      !confirm(`Excluir o reel "${post.content?.slice(0, 40) ?? "sem legenda"}"?`)
    )
      return;

    clearCardError(post.id);
    setReels((prev) => prev.filter((r) => r.id !== post.id));
    setTotal((prev) => prev - 1);
    setDeletingIds((prev) => new Set(prev).add(post.id));

    try {
      const res = await fetch(`/api/posts?id=${post.id}`, { method: "DELETE" });
      if (!res.ok) {
        setReels((prev) => {
          const idx = prev.findIndex((r) => r.createdAt < post.createdAt);
          const next = [...prev];
          if (idx === -1) next.push(post);
          else next.splice(idx, 0, post);
          return next;
        });
        setTotal((prev) => prev + 1);
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setCardError(post.id, data.error ?? "Erro ao excluir reel");
      }
    } catch {
      setReels((prev) =>
        [...prev, post].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      );
      setTotal((prev) => prev + 1);
      setCardError(post.id, "Erro de conexão ao excluir");
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(post.id);
        return next;
      });
    }
  }

  // ─── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {Array.from({ length: PAGE_SIZE }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  // ─── Empty state ───────────────────────────────────────────────────────────
  if (reels.length === 0 && total === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-20">
          <FilmIcon className="h-14 w-14 text-gray-300 mb-4" />
          <p className="text-gray-700 font-semibold text-lg mb-1">
            Nenhum reel cadastrado
          </p>
          <p className="text-gray-400 text-sm mb-6 text-center max-w-xs">
            Faça upload de um vídeo e gere uma legenda com IA para criar seu
            primeiro reel.
          </p>
          <Button variant="gradient" asChild>
            <Link href="/video/new">
              <Video className="h-4 w-4" />
              Criar reel
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ─── Grid ──────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {reels.map((reel) => {
            const status = (statusConfig[reel.status] ?? statusConfig["draft"])!;
            const StatusIcon = status.icon;
            const platformLabel = platformLabels[reel.platform] ?? reel.platform;
            const captionExcerpt = reel.content
              ? reel.content.slice(0, 100) +
                (reel.content.length > 100 ? "…" : "")
              : null;
            const cardError = cardErrors.find((e) => e.postId === reel.id);
            const isPublishing = publishingIds.has(reel.id);
            const isDeleting = deletingIds.has(reel.id);

            return (
              <Card
                key={reel.id}
                className="overflow-hidden flex flex-col hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer group"
                onClick={() => openModal(reel)}
              >
                {/* Thumbnail / placeholder */}
                {reel.imageUrl ? (
                  <div className="relative h-40 bg-black overflow-hidden shrink-0">
                    <video
                      src={reel.imageUrl}
                      className="w-full h-full object-cover"
                      muted
                      preload="metadata"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                      <Video className="h-8 w-8 text-white/80" />
                    </div>
                  </div>
                ) : (
                  <div className="h-40 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center shrink-0">
                    <FilmIcon className="h-10 w-10 text-gray-300" />
                  </div>
                )}

                <CardContent className="p-3 flex flex-col gap-2 flex-1">
                  {/* Platform + Status */}
                  <div className="flex items-center justify-between gap-1 flex-wrap">
                    <span className="text-xs font-medium text-gray-600 capitalize">
                      {platformLabel}
                    </span>
                    <Badge variant={status.variant} className="gap-1 shrink-0">
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </Badge>
                  </div>

                  {/* Caption excerpt */}
                  <p className="text-xs text-gray-600 leading-relaxed line-clamp-3 flex-1">
                    {captionExcerpt ?? (
                      <span className="text-gray-400 italic">Sem legenda</span>
                    )}
                  </p>

                  {/* Date */}
                  <div className="text-xs text-gray-400">
                    {reel.status === "published" && reel.publishedAt ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="h-3 w-3" />
                        {new Date(reel.publishedAt).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    ) : reel.scheduledAt ? (
                      <span className="flex items-center gap-1 text-orange-500">
                        <Clock className="h-3 w-3" />
                        {new Date(reel.scheduledAt).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    ) : (
                      <span>
                        {new Date(reel.createdAt).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                    )}
                  </div>

                  {/* Inline error */}
                  {cardError && (
                    <div className="flex items-start gap-1.5 text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>{cardError.message}</span>
                    </div>
                  )}

                  {/* Actions — stop propagation so clicks don't open the modal */}
                  <div
                    className="flex items-center justify-between gap-1.5 pt-1 border-t border-gray-50"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Ver (icon only — card is already fully clickable) */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      onClick={(e) => { e.stopPropagation(); openModal(reel); }}
                      title="Ver detalhes"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>

                    <div className="flex items-center gap-1.5">
                      {/* Publish now — only for draft/scheduled */}
                      {(reel.status === "draft" || reel.status === "scheduled") && (
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs"
                          onClick={(e) => { e.stopPropagation(); void handlePublish(reel); }}
                          disabled={isPublishing || isDeleting}
                        >
                          {isPublishing ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              <span className="ml-1">...</span>
                            </>
                          ) : (
                            <>
                              <Send className="h-3 w-3" />
                              <span className="ml-1">Publicar</span>
                            </>
                          )}
                        </Button>
                      )}

                      {/* Delete */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={(e) => { e.stopPropagation(); void handleDelete(reel); }}
                        disabled={isDeleting || isPublishing}
                      >
                        {isDeleting ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        <span className="ml-1">Excluir</span>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>
              Página {page} de {totalPages} · {total} reels
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Próxima
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Reel Detail Modal ─────────────────────────────────────────────── */}
      {selectedReel && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <FilmIcon className="h-5 w-5 text-blue-500" />
                <span className="font-semibold text-gray-900 capitalize">
                  {platformLabels[selectedReel.platform] ?? selectedReel.platform}
                </span>
                <Badge
                  variant={
                    statusConfig[selectedReel.status]?.variant ?? "secondary"
                  }
                >
                  {statusConfig[selectedReel.status]?.label ?? selectedReel.status}
                </Badge>
              </div>
              <button
                onClick={closeModal}
                className="p-2 rounded-lg hover:bg-gray-100 transition"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1">
              {/* Video player */}
              {selectedReel.imageUrl && (
                <div className="w-full bg-black shrink-0">
                  <video
                    src={selectedReel.imageUrl}
                    controls
                    className="w-full max-h-[50vh] object-contain"
                  />
                </div>
              )}

              <div className="p-6 space-y-4">
                {/* Publish result feedback */}
                {modalPublishResult && (
                  <div
                    className={cn(
                      "flex items-center gap-2 p-3 rounded-lg text-sm",
                      modalPublishResult.success
                        ? "bg-green-50 border border-green-100 text-green-700"
                        : "bg-red-50 border border-red-100 text-red-700"
                    )}
                  >
                    {modalPublishResult.success ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0" />
                    )}
                    {modalPublishResult.message}
                  </div>
                )}

                {/* Content — editable or read-only */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                      Legenda
                    </p>
                    {!editMode && selectedReel.status !== "published" && (
                      <button
                        onClick={() => {
                          setEditMode(true);
                          setEditContent(selectedReel.content ?? "");
                        }}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                      >
                        <Pencil className="h-3 w-3" />
                        Editar
                      </button>
                    )}
                  </div>
                  {editMode ? (
                    <div className="space-y-2">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={6}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                      {modalSaveError && (
                        <p className="text-xs text-red-600">{modalSaveError}</p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => void handleModalSaveEdit()}
                          disabled={modalSaving}
                        >
                          {modalSaving ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Salvando...
                            </>
                          ) : (
                            "Salvar"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditMode(false)}
                          disabled={modalSaving}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-800 whitespace-pre-wrap leading-relaxed text-sm">
                      {selectedReel.content ?? (
                        <span className="text-gray-400 italic">Sem legenda</span>
                      )}
                    </p>
                  )}
                </div>

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                      Criado em
                    </p>
                    <p className="text-sm text-gray-700">
                      {new Date(selectedReel.createdAt).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  {selectedReel.scheduledAt && (
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                        Agendado para
                      </p>
                      <p className="text-sm text-orange-600 font-medium">
                        {new Date(selectedReel.scheduledAt).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  )}
                  {selectedReel.publishedAt && (
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                        Publicado em
                      </p>
                      <p className="text-sm text-green-600 font-medium">
                        {new Date(selectedReel.publishedAt).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-3 pt-2 flex-wrap">
                  {(selectedReel.status === "draft" ||
                    selectedReel.status === "scheduled") &&
                    !editMode && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => void handleModalPublish()}
                        disabled={modalPublishing}
                      >
                        {modalPublishing ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Publicando...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4" />
                            Publicar agora
                          </>
                        )}
                      </Button>
                    )}

                  {selectedReel.status === "draft" && !editMode && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href="/schedule">
                        <Calendar className="h-4 w-4" />
                        Agendar
                      </Link>
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 ml-auto"
                    onClick={() => void handleModalDelete()}
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

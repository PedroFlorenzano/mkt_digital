"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Lock,
  ChevronUp,
  ChevronDown,
  Loader2,
  Calendar,
  ImageIcon,
  AlertCircle,
} from "lucide-react";
import { Button } from "@client/components/ui/button";
import { Card, CardContent } from "@client/components/ui/card";
import { cn } from "@server/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FeedGridItem {
  id: string;
  imageUrl: string | null;
  content: string | null;
  status: string;
  platform: string;
  publishedAt: string | null;
  scheduledAt: string | null;
  gridOrder: number | null;
  format: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Sends a PATCH to update a single post's gridOrder.
 * Returns true on success, false on failure.
 */
async function patchGridOrder(postId: string, gridOrder: number): Promise<boolean> {
  const res = await fetch("/api/instagram/grid", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postId, gridOrder }),
  });
  return res.ok;
}

// ---------------------------------------------------------------------------
// PublishedPostCard
// ---------------------------------------------------------------------------

interface PublishedPostCardProps {
  post: FeedGridItem;
}

function PublishedPostCard({ post }: PublishedPostCardProps) {
  return (
    <div
      className="relative w-full aspect-square bg-gray-100 rounded-xl overflow-hidden border border-gray-200"
      aria-label={`Post publicado em ${formatDate(post.publishedAt)}`}
    >
      {post.imageUrl ? (
        <img
          src={post.imageUrl}
          alt={post.content ?? "Post publicado"}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-400 p-3">
          <ImageIcon className="h-8 w-8 shrink-0" />
          {post.content && (
            <p className="text-xs text-gray-500 text-center line-clamp-3">
              {post.content}
            </p>
          )}
        </div>
      )}
      <div className="absolute inset-0 bg-black/25 flex flex-col items-center justify-end pb-3 gap-1.5 pointer-events-none">
        <div className="bg-white/90 rounded-full p-1.5 shadow">
          <Lock className="h-3.5 w-3.5 text-gray-700" />
        </div>
        {post.publishedAt && (
          <span className="bg-black/60 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
            <Calendar className="h-3 w-3 shrink-0" />
            {formatDate(post.publishedAt)}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FuturePostCard
// ---------------------------------------------------------------------------

interface FuturePostCardProps {
  post: FeedGridItem;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  /** Any reorder in flight — disables ALL buttons globally */
  isAnyReordering: boolean;
  /** This specific post is being moved — shows spinner */
  isThisReordering: boolean;
}

function FuturePostCard({
  post,
  index,
  total,
  onMoveUp,
  onMoveDown,
  isAnyReordering,
  isThisReordering,
}: FuturePostCardProps) {
  const isFirst = index === 0;
  const isLast = index === total - 1;

  const statusLabel =
    post.status === "scheduled" && post.scheduledAt
      ? `Agendado · ${formatDate(post.scheduledAt)}`
      : "Rascunho";

  return (
    <div
      className={cn(
        "relative w-full aspect-square bg-gray-50 rounded-xl overflow-hidden border border-dashed border-gray-300 flex flex-col",
        isThisReordering && "ring-2 ring-blue-300",
      )}
      aria-label={`Post ${statusLabel}`}
    >
      {/* Image or content preview */}
      <div className="flex-1 relative overflow-hidden">
        {post.imageUrl ? (
          <img
            src={post.imageUrl}
            alt={post.content ?? "Post futuro"}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-400 p-3">
            <ImageIcon className="h-6 w-6 shrink-0" />
            {post.content ? (
              <p className="text-xs text-gray-600 text-center line-clamp-4">
                {post.content}
              </p>
            ) : (
              <span className="text-xs text-gray-400">Sem conteúdo</span>
            )}
          </div>
        )}
      </div>

      {/* Status badge */}
      <div className="px-2 py-1.5 bg-white border-t border-gray-100 shrink-0">
        <span className="text-xs text-gray-500 truncate block">{statusLabel}</span>
      </div>

      {/* Reorder buttons */}
      <div className="absolute top-1.5 right-1.5 flex flex-col gap-0.5">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 bg-white/95 shadow-sm hover:bg-blue-50 hover:border-blue-300 disabled:opacity-30 transition-colors"
          onClick={onMoveUp}
          disabled={isFirst || isAnyReordering}
          aria-label={`Mover post para cima (posição ${index + 1} de ${total})`}
          title="Mover para cima"
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 bg-white/95 shadow-sm hover:bg-blue-50 hover:border-blue-300 disabled:opacity-30 transition-colors"
          onClick={onMoveDown}
          disabled={isLast || isAnyReordering}
          aria-label={`Mover post para baixo (posição ${index + 1} de ${total})`}
          title="Mover para baixo"
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>

      {/* Spinner overlay while this post is moving */}
      {isThisReordering && (
        <div className="absolute inset-0 bg-white/50 flex items-center justify-center pointer-events-none">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FeedGridPlanner
// ---------------------------------------------------------------------------

export function FeedGridPlanner() {
  const [publishedPosts, setPublishedPosts] = useState<FeedGridItem[]>([]);
  // Local ordered state for future posts — updated optimistically on move
  const [localFuturePosts, setLocalFuturePosts] = useState<FeedGridItem[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchGrid = useCallback(async (showLoading = false) => {
    if (showLoading) setInitialLoading(true);
    try {
      const res = await fetch("/api/instagram/grid");
      if (!res.ok) throw new Error("Falha ao carregar o feed.");
      const data: { posts: FeedGridItem[] } = await res.json();
      const all = data.posts ?? [];
      setPublishedPosts(all.filter((p) => p.status === "published"));
      setLocalFuturePosts(
        all.filter((p) => p.status === "scheduled" || p.status === "draft"),
      );
      setFetchError(null);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGrid(true);
  }, [fetchGrid]);

  // ── Reorder ───────────────────────────────────────────────────────────────

  const handleMove = useCallback(
    async (postId: string, currentIndex: number, direction: "up" | "down") => {
      if (isReordering) return; // hard guard — drop extra clicks

      const targetIndex =
        direction === "up" ? currentIndex - 1 : currentIndex + 1;

      if (targetIndex < 0 || targetIndex >= localFuturePosts.length) return;

      const displaced = localFuturePosts[targetIndex];
      const moving = localFuturePosts[currentIndex];
      if (!displaced || !moving) return;

      // ── Optimistic update: swap positions in local state immediately ──────
      setLocalFuturePosts((prev) => {
        const next = [...prev];
        // Swap the two items
        const temp = next[currentIndex];
        next[currentIndex] = next[targetIndex]!;
        next[targetIndex] = temp!;
        return next;
      });

      // ── Lock all buttons ──────────────────────────────────────────────────
      setIsReordering(true);
      setReorderingId(postId);
      setReorderError(null);

      try {
        // Persist the swap: update BOTH posts so gridOrder values don't collide.
        // moving post → targetIndex, displaced post → currentIndex.
        const [ok1, ok2] = await Promise.all([
          patchGridOrder(moving.id, targetIndex),
          patchGridOrder(displaced.id, currentIndex),
        ]);

        if (!ok1 || !ok2) {
          throw new Error("Falha ao salvar a nova ordem. Tente novamente.");
        }
        // Success — local state already shows the correct order, no re-fetch needed.
      } catch (err) {
        // Revert optimistic update on failure
        setLocalFuturePosts((prev) => {
          const next = [...prev];
          const temp = next[targetIndex];
          next[targetIndex] = next[currentIndex]!;
          next[currentIndex] = temp!;
          return next;
        });
        setReorderError(err instanceof Error ? err.message : "Erro ao reordenar.");
      } finally {
        setIsReordering(false);
        setReorderingId(null);
      }
    },
    [isReordering, localFuturePosts],
  );

  // ── Display ───────────────────────────────────────────────────────────────

  const displayPosts: Array<FeedGridItem & { isFuture: boolean; futureIndex: number }> =
    [
      ...publishedPosts.map((p) => ({ ...p, isFuture: false, futureIndex: -1 })),
      ...localFuturePosts.map((p, i) => ({ ...p, isFuture: true, futureIndex: i })),
    ];

  // ── Loading ───────────────────────────────────────────────────────────────

  if (initialLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-sm text-gray-500">Carregando feed do Instagram…</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
          <p className="text-red-500 font-medium">Erro ao carregar o feed</p>
          <p className="text-sm text-gray-500">{fetchError}</p>
          <Button variant="outline" onClick={() => fetchGrid(true)}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (displayPosts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
          <ImageIcon className="h-10 w-10 text-gray-300" />
          <p className="text-gray-600 font-medium">Nenhum post encontrado</p>
          <p className="text-sm text-gray-400 text-center max-w-xs">
            Crie posts para o Instagram e eles aparecerão aqui para você planejar o
            layout do grid.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Grid ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">Planejador de Feed</h3>
        <span className="text-sm text-gray-500">
          {displayPosts.length} {displayPosts.length === 1 ? "post" : "posts"}
          {isReordering && (
            <span className="ml-2 text-blue-500 inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Salvando…
            </span>
          )}
        </span>
      </div>

      {/* Reorder error banner */}
      {reorderError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{reorderError}</span>
          <button
            className="ml-auto text-xs underline"
            onClick={() => setReorderError(null)}
          >
            Fechar
          </button>
        </div>
      )}

      {/* 3-column grid */}
      <div className="grid grid-cols-3 gap-2" role="list" aria-label="Grid do feed do Instagram">
        {displayPosts.map((post) => (
          <div key={post.id} role="listitem">
            {!post.isFuture ? (
              <PublishedPostCard post={post} />
            ) : (
              <FuturePostCard
                post={post}
                index={post.futureIndex}
                total={localFuturePosts.length}
                onMoveUp={() => handleMove(post.id, post.futureIndex, "up")}
                onMoveDown={() => handleMove(post.id, post.futureIndex, "down")}
                isAnyReordering={isReordering}
                isThisReordering={reorderingId === post.id}
              />
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <Lock className="h-3 w-3" />
          Publicado (bloqueado)
        </span>
        <span className="flex items-center gap-1">
          <ChevronUp className="h-3 w-3" />
          <ChevronDown className="h-3 w-3" />
          Reordenável (clique para mover)
        </span>
      </div>
    </div>
  );
}

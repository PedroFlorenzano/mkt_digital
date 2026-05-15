"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  PlusSquare,
  Search,
  Filter,
  Eye,
  Calendar,
  Share2,
  Trash2,
  X,
  Clock,
  CheckCircle2,
  FileText,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";
import { Button } from "@client/components/ui/button";
import { Badge } from "@client/components/ui/badge";
import { Card, CardContent } from "@client/components/ui/card";
import { Input } from "@client/components/ui/input";
import { cn } from "@server/lib/utils";

interface Post {
  id: string;
  platform: string;
  content: string | null;
  imageUrl: string | null;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
}

const statusConfig: Record<string, { label: string; variant: "secondary" | "warning" | "success" | "default" | "purple"; icon: React.ElementType }> = {
  draft: { label: "Rascunho", variant: "secondary", icon: FileText },
  scheduled: { label: "Agendado", variant: "warning", icon: Clock },
  published: { label: "Publicado", variant: "success", icon: CheckCircle2 },
};

const platformConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  instagram: { label: "Instagram", icon: Share2, color: "text-pink-500" },
  facebook: { label: "Facebook", icon: Share2, color: "text-blue-600" },
  linkedin: { label: "LinkedIn", icon: Share2, color: "text-blue-700" },
  whatsapp: { label: "WhatsApp", icon: Share2, color: "text-green-500" },
};

export default function PostsPage() {
  const { data: session } = useSession();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [page, setPage] = useState(1);
  const PER_PAGE = 9;

  useEffect(() => {
    if (session) {
      fetch("/api/posts")
        .then((r) => r.json())
        .then((data) => {
          setPosts(Array.isArray(data) ? data : []);
          setLoading(false);
        });
    }
  }, [session]);

  const filtered = posts.filter((p) => {
    const matchSearch = !search || p.content?.toLowerCase().includes(search.toLowerCase()) || p.platform.includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    const matchPlatform = filterPlatform === "all" || p.platform === filterPlatform;
    return matchSearch && matchStatus && matchPlatform;
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const counts = {
    all: posts.length,
    draft: posts.filter((p) => p.status === "draft").length,
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    published: posts.filter((p) => p.status === "published").length,
  };

  if (!session) return null;

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meus Posts</h1>
          <p className="text-gray-500 mt-1">{posts.length} posts no total</p>
        </div>
        <Button variant="gradient" asChild>
          <Link href="/create-post">
            <PlusSquare className="h-4 w-4" />
            Novo post
          </Link>
        </Button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { key: "all", label: "Todos" },
          { key: "draft", label: "Rascunhos" },
          { key: "scheduled", label: "Agendados" },
          { key: "published", label: "Publicados" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setFilterStatus(tab.key); setPage(1); }}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-all",
              filterStatus === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            {tab.label}
            <span className={cn(
              "ml-2 text-xs px-1.5 py-0.5 rounded-full",
              filterStatus === tab.key ? "bg-blue-100 text-blue-700" : "bg-gray-200 text-gray-500"
            )}>
              {counts[tab.key as keyof typeof counts]}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar posts..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={filterPlatform}
            onChange={(e) => { setFilterPlatform(e.target.value); setPage(1); }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            <option value="all">Todas as plataformas</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="linkedin">LinkedIn</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : paginated.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-12 w-12 text-gray-300 mb-4" />
            <p className="text-gray-500 font-medium mb-2">Nenhum post encontrado</p>
            <p className="text-gray-400 text-sm mb-6">
              {search || filterStatus !== "all" || filterPlatform !== "all"
                ? "Tente ajustar os filtros"
                : "Crie seu primeiro post com IA"}
            </p>
            <Button variant="gradient" asChild>
              <Link href="/create-post">
                <PlusSquare className="h-4 w-4" />
                Criar post
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginated.map((post) => {
              const status = statusConfig[post.status] ?? statusConfig.draft;
              const platform = platformConfig[post.platform];
              const PlatformIcon = platform?.icon ?? Share2;
              const StatusIcon = status.icon;

              return (
                <Card
                  key={post.id}
                  className="overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer group"
                  onClick={() => setSelectedPost(post)}
                >
                  {/* Image */}
                  {post.imageUrl ? (
                    <div className="relative h-44 bg-gray-100 overflow-hidden">
                      <Image
                        src={post.imageUrl}
                        alt="Post"
                        fill
                        sizes="(max-width: 768px) 100vw, 33vw"
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        unoptimized
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                    </div>
                  ) : (
                    <div className="h-20 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
                      <FileText className="h-8 w-8 text-gray-300" />
                    </div>
                  )}

                  <CardContent className="p-4">
                    {/* Platform + Status */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-1.5">
                        <PlatformIcon className={cn("h-4 w-4", platform?.color ?? "text-gray-400")} />
                        <span className="text-xs font-medium text-gray-600 capitalize">{post.platform}</span>
                      </div>
                      <Badge variant={status.variant} className="gap-1">
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </Badge>
                    </div>

                    {/* Content preview */}
                    <p className="text-sm text-gray-700 line-clamp-3 leading-relaxed mb-3">
                      {post.content ?? <span className="text-gray-400 italic">Sem texto</span>}
                    </p>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                      <span className="text-xs text-gray-400">
                        {new Date(post.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                      </span>
                      {post.scheduledAt && (
                        <div className="flex items-center gap-1 text-xs text-orange-600">
                          <Calendar className="h-3 w-3" />
                          {new Date(post.scheduledAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 -mr-1">
                        <Eye className="h-3 w-3 mr-1" />
                        Ver
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <Button variant="outline" size="icon" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Button
                  key={p}
                  variant={p === page ? "default" : "outline"}
                  size="icon"
                  onClick={() => setPage(p)}
                  className="h-9 w-9"
                >
                  {p}
                </Button>
              ))}
              <Button variant="outline" size="icon" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Post Detail Modal */}
      {selectedPost && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelectedPost(null)}>
          <div
            className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header — fixo */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                {(() => {
                  const platform = platformConfig[selectedPost.platform];
                  const PlatformIcon = platform?.icon ?? Share2;
                  return (
                    <>
                      <PlatformIcon className={cn("h-5 w-5", platform?.color ?? "text-gray-400")} />
                      <span className="font-semibold text-gray-900 capitalize">{selectedPost.platform}</span>
                    </>
                  );
                })()}
                <Badge variant={statusConfig[selectedPost.status]?.variant ?? "secondary"}>
                  {statusConfig[selectedPost.status]?.label ?? selectedPost.status}
                </Badge>
              </div>
              <button onClick={() => setSelectedPost(null)} className="p-2 rounded-lg hover:bg-gray-100 transition">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Conteúdo com scroll */}
            <div className="overflow-y-auto flex-1">
              {selectedPost.imageUrl && (
                <div className="relative w-full bg-gray-100 shrink-0">
                  <img
                    src={selectedPost.imageUrl}
                    alt="Post"
                    className="w-full h-auto object-contain max-h-[50vh]"
                  />
                </div>
              )}

              <div className="p-6 space-y-4">
                {selectedPost.content && (
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Conteúdo</p>
                    <p className="text-gray-800 whitespace-pre-wrap leading-relaxed text-sm">{selectedPost.content}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Criado em</p>
                    <p className="text-sm text-gray-700">{new Date(selectedPost.createdAt).toLocaleString("pt-BR")}</p>
                  </div>
                  {selectedPost.scheduledAt && (
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Agendado para</p>
                      <p className="text-sm text-orange-600 font-medium">{new Date(selectedPost.scheduledAt).toLocaleString("pt-BR")}</p>
                    </div>
                  )}
                  {selectedPost.publishedAt && (
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Publicado em</p>
                      <p className="text-sm text-green-600 font-medium">{new Date(selectedPost.publishedAt).toLocaleString("pt-BR")}</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  {selectedPost.status === "draft" && (
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
                    onClick={async () => {
                      if (!confirm("Excluir este post?")) return;
                      const res = await fetch(`/api/posts?id=${selectedPost.id}`, { method: "DELETE" });
                      if (res.ok) {
                        setPosts((prev) => prev.filter((p) => p.id !== selectedPost.id));
                        setSelectedPost(null);
                      }
                    }}
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
    </DashboardLayout>
  );
}

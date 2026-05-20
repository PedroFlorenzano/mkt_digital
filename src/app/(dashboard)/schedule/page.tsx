"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  PlusSquare,
  Clock,
  Calendar,
  X,
  Loader2,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";
import { Button } from "@client/components/ui/button";
import { Badge } from "@client/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";
import { Label } from "@client/components/ui/label";
import { cn } from "@server/lib/utils";

interface Post {
  id: string;
  platform: string;
  content: string | null;
  imageUrl: string | null;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
  format?: string | null;
}

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const platformColors: Record<string, string> = {
  instagram: "bg-pink-100 text-pink-700 border-pink-200",
  facebook: "bg-blue-100 text-blue-700 border-blue-200",
  linkedin: "bg-blue-100 text-blue-800 border-blue-200",
  whatsapp: "bg-green-100 text-green-700 border-green-200",
};

const formatConfig: Record<string, { label: string; emoji: string; cls: string }> = {
  post:      { label: "Post",      emoji: "📝", cls: "bg-gray-100 text-gray-600 border-gray-200" },
  carousel:  { label: "Carrossel", emoji: "🗂️", cls: "bg-orange-100 text-orange-700 border-orange-200" },
  story:     { label: "Story",     emoji: "⚡", cls: "bg-purple-100 text-purple-700 border-purple-200" },
  reel:      { label: "Reel",      emoji: "🎬", cls: "bg-blue-100 text-blue-700 border-blue-200" },
};

function FormatBadge({ format }: { format?: string | null }) {
  const cfg = formatConfig[format ?? "post"] ?? formatConfig["post"]!;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border font-medium", cfg.cls)}>
      {cfg.emoji} {cfg.label}
    </span>
  );
}

export default function SchedulePage() {
  const { data: session } = useSession();
  const [posts, setPosts] = useState<Post[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedPost, setSelectedPost] = useState<string>("");
  const [scheduledTime, setScheduledTime] = useState("10:00");
  const [recurrence, setRecurrence] = useState("none");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [draftPosts, setDraftPosts] = useState<Post[]>([]);
  const [detailPost, setDetailPost] = useState<Post | null>(null);

  useEffect(() => {
    if (session) {
      fetch("/api/posts?pageSize=200")
        .then((r) => r.json())
        .then((data: unknown) => {
          // API now returns paginated shape { data: Post[], total, ... }
          const all: Post[] = Array.isArray(data)
            ? (data as Post[])
            : Array.isArray((data as { data?: Post[] }).data)
            ? ((data as { data: Post[] }).data)
            : [];
          setPosts(all);
          setDraftPosts(all.filter((p: Post) => p.status === "draft"));
        });
    }
  }, [session]);

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const today = new Date();

  function getPostsForDay(day: number) {
    return posts.filter((p) => {
      if (!p.scheduledAt) return false;
      const d = new Date(p.scheduledAt);
      return d.getDate() === day && d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear();
    });
  }

  async function handleSchedule() {
    if (!selectedPost || !selectedDate) return;
    setLoading(true);
    const [h, m] = scheduledTime.split(":").map(Number);
    const scheduledAt = new Date(selectedDate);
    scheduledAt.setHours(h ?? 0, m ?? 0, 0, 0);

    const res = await fetch("/api/posts/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: selectedPost, scheduledAt: scheduledAt.toISOString(), recurrence }),
    });

    if (res.ok) {
      const updated = await fetch("/api/posts?pageSize=200").then((r) => r.json()) as unknown;
      const all: Post[] = Array.isArray(updated)
        ? (updated as Post[])
        : Array.isArray((updated as { data?: Post[] }).data)
        ? ((updated as { data: Post[] }).data)
        : [];
      setPosts(all);
      setDraftPosts(all.filter((p: Post) => p.status === "draft"));
      setSelectedPost("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
    setLoading(false);
  }

  if (!session) return null;

  const dayPosts = selectedDate ? getPostsForDay(selectedDate.getDate()) : [];

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agendamento</h1>
          <p className="text-gray-500 mt-1">Planeje suas publicações no calendário</p>
        </div>
        <Button variant="gradient" asChild>
          <Link href="/create-post">
            <PlusSquare className="h-4 w-4" />
            Novo post
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="text-base">
                {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-2">
              {DAYS.map((d) => (
                <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dayPostsList = getPostsForDay(day);
                const isToday = day === today.getDate() && currentDate.getMonth() === today.getMonth() && currentDate.getFullYear() === today.getFullYear();
                const isSelected = selectedDate?.getDate() === day && selectedDate?.getMonth() === currentDate.getMonth() && selectedDate?.getFullYear() === currentDate.getFullYear();
                const isPast = new Date(currentDate.getFullYear(), currentDate.getMonth(), day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day))}
                    className={cn(
                      "relative p-1.5 h-16 rounded-lg text-left transition-all text-xs",
                      isSelected ? "bg-blue-600 text-white ring-2 ring-blue-300" :
                      isToday ? "bg-blue-50 border-2 border-blue-300" :
                      isPast ? "opacity-50 hover:bg-gray-50" :
                      "hover:bg-gray-50 border border-transparent hover:border-gray-200"
                    )}
                  >
                    <span className={cn("font-semibold", isSelected ? "text-white" : isToday ? "text-blue-600" : "text-gray-700")}>
                      {day}
                    </span>
                    {dayPostsList.length > 0 && (
                      <div className="mt-0.5 space-y-0.5">
                        {dayPostsList.slice(0, 2).map((p) => (
                          <div
                            key={p.id}
                            className={cn(
                              "text-xs px-1 py-0.5 rounded truncate border",
                              isSelected ? "bg-white/20 text-white border-white/30" : platformColors[p.platform] ?? "bg-gray-100 text-gray-600 border-gray-200"
                            )}
                          >
                            {p.platform.slice(0, 2).toUpperCase()}
                          </div>
                        ))}
                        {dayPostsList.length > 2 && (
                          <span className={cn("text-xs", isSelected ? "text-white/70" : "text-gray-400")}>
                            +{dayPostsList.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100">
              {Object.entries(platformColors).map(([platform, cls]) => (
                <div key={platform} className="flex items-center gap-1.5">
                  <div className={cn("w-3 h-3 rounded border", cls)} />
                  <span className="text-xs text-gray-500 capitalize">{platform}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Side panel */}
        <div className="space-y-4">
          {/* Schedule form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-600" />
                Agendar post
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {success && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-100 rounded-lg text-sm text-green-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Post agendado com sucesso!
                </div>
              )}

              {draftPosts.length === 0 ? (
                <div className="text-center py-4">
                  <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 mb-3">Nenhum rascunho disponível</p>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/create-post">Criar post</Link>
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label>Post</Label>
                    <select
                      value={selectedPost}
                      onChange={(e) => setSelectedPost(e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    >
                      <option value="">Selecione um rascunho</option>
                      {draftPosts.map((p) => {
                        const fmt = formatConfig[p.format ?? "post"] ?? formatConfig["post"]!;
                        return (
                          <option key={p.id} value={p.id}>
                            {fmt.emoji} {fmt.label} · [{p.platform}] {p.content?.slice(0, 30) ?? "Sem texto"}…
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Data selecionada</Label>
                    <div className={cn(
                      "text-sm px-3 py-2 rounded-lg border",
                      selectedDate ? "text-gray-700 border-blue-200 bg-blue-50" : "text-gray-400 border-gray-200 bg-gray-50"
                    )}>
                      {selectedDate
                        ? selectedDate.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
                        : "Clique em um dia no calendário"}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Horário</Label>
                    <input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Recorrência</Label>
                    <select
                      value={recurrence}
                      onChange={(e) => setRecurrence(e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    >
                      <option value="none">Sem recorrência</option>
                      <option value="daily">Diário</option>
                      <option value="weekly">Semanal</option>
                      <option value="biweekly">Quinzenal</option>
                      <option value="monthly">Mensal</option>
                    </select>
                  </div>

                  <Button
                    onClick={handleSchedule}
                    disabled={!selectedPost || !selectedDate || loading}
                    variant="gradient"
                    className="w-full"
                  >
                    {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Agendando...</> : "Agendar publicação"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Posts do dia selecionado */}
          {selectedDate && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-gray-600">
                  {selectedDate.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}
                  <span className="ml-2 text-xs text-gray-400">({dayPosts.length} post{dayPosts.length !== 1 ? "s" : ""})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dayPosts.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-2">Nenhum post agendado</p>
                ) : (
                  <div className="space-y-2">
                    {dayPosts.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setDetailPost(p)}
                        className="w-full text-left p-3 rounded-xl bg-gray-50 border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition-all group"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="secondary" className={cn("text-xs", platformColors[p.platform])}>
                              {p.platform}
                            </Badge>
                            <FormatBadge format={p.format} />
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-400">
                            <Clock className="h-3 w-3" />
                            {p.scheduledAt && new Date(p.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                        <p className="text-xs text-gray-600 line-clamp-2">{p.content ?? "Sem texto"}</p>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Post detail modal */}
      {detailPost && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDetailPost(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header fixo */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className={cn(platformColors[detailPost.platform])}>
                  {detailPost.platform}
                </Badge>
                <FormatBadge format={detailPost.format} />
                <Badge variant="warning">Agendado</Badge>
              </div>
              <button onClick={() => setDetailPost(null)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            {/* Conteúdo com scroll */}
            <div className="overflow-y-auto flex-1">
              {detailPost.imageUrl && (
                <div className="w-full bg-gray-100 shrink-0">
                  <img
                    src={detailPost.imageUrl}
                    alt="Post"
                    className="w-full h-auto object-contain max-h-[50vh]"
                  />
                </div>
              )}
              <div className="p-5 space-y-3">
                {detailPost.content && (
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{detailPost.content}</p>
                )}
                {detailPost.scheduledAt && (
                  <div className="flex items-center gap-2 text-sm text-orange-600 bg-orange-50 px-3 py-2 rounded-lg">
                    <Calendar className="h-4 w-4 shrink-0" />
                    Agendado para {new Date(detailPost.scheduledAt).toLocaleString("pt-BR")}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

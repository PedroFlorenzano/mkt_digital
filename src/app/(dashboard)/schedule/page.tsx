"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Post {
  id: string;
  platform: string;
  content: string | null;
  imageUrl: string | null;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
}

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export default function SchedulePage() {
  const { data: session } = useSession();
  const [posts, setPosts] = useState<Post[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedPost, setSelectedPost] = useState<string>("");
  const [scheduledTime, setScheduledTime] = useState("10:00");
  const [recurrence, setRecurrence] = useState("none");
  const [loading, setLoading] = useState(false);
  const [draftPosts, setDraftPosts] = useState<Post[]>([]);

  useEffect(() => {
    if (session) {
      fetch("/api/posts")
        .then((res) => res.json())
        .then((data) => {
          const all = Array.isArray(data) ? data : [];
          setPosts(all);
          setDraftPosts(all.filter((p: Post) => p.status === "draft"));
        });
    }
  }, [session]);

  function getDaysInMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }

  function getFirstDayOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  }

  function getScheduledPostsForDay(day: number) {
    return posts.filter((p) => {
      if (!p.scheduledAt) return false;
      const d = new Date(p.scheduledAt);
      return (
        d.getDate() === day &&
        d.getMonth() === currentDate.getMonth() &&
        d.getFullYear() === currentDate.getFullYear()
      );
    });
  }

  function prevMonth() {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  }

  function nextMonth() {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  }

  async function handleSchedule() {
    if (!selectedPost || !selectedDate) return;

    setLoading(true);
    const [hours, minutes] = scheduledTime.split(":").map(Number);
    const scheduledAt = new Date(selectedDate);
    scheduledAt.setHours(hours, minutes, 0, 0);

    const res = await fetch("/api/posts/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postId: selectedPost,
        scheduledAt: scheduledAt.toISOString(),
        recurrence,
      }),
    });

    if (res.ok) {
      const updatedRes = await fetch("/api/posts");
      const updatedData = await updatedRes.json();
      const all = Array.isArray(updatedData) ? updatedData : [];
      setPosts(all);
      setDraftPosts(all.filter((p: Post) => p.status === "draft"));
      setSelectedPost("");
      setSelectedDate(null);
    }

    setLoading(false);
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);
  const today = new Date();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link href="/dashboard" className="text-xl font-bold text-blue-600">
              MKT Digital
            </Link>
            <Link
              href="/create-post"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition text-sm"
            >
              Novo post
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Agendamento</h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendário */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={prevMonth}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h3 className="text-lg font-semibold text-gray-900">
                {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h3>
              <button
                onClick={nextMonth}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {DAYS.map((day) => (
                <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                  {day}
                </div>
              ))}

              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}

              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const scheduledPosts = getScheduledPostsForDay(day);
                const isToday =
                  day === today.getDate() &&
                  currentDate.getMonth() === today.getMonth() &&
                  currentDate.getFullYear() === today.getFullYear();
                const isSelected =
                  selectedDate?.getDate() === day &&
                  selectedDate?.getMonth() === currentDate.getMonth() &&
                  selectedDate?.getFullYear() === currentDate.getFullYear();

                return (
                  <button
                    key={day}
                    onClick={() =>
                      setSelectedDate(
                        new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
                      )
                    }
                    className={`relative p-2 h-20 rounded-lg text-left transition text-sm ${
                      isSelected
                        ? "bg-blue-100 border-2 border-blue-600"
                        : isToday
                        ? "bg-blue-50 border border-blue-200"
                        : "hover:bg-gray-50 border border-transparent"
                    }`}
                  >
                    <span
                      className={`font-medium ${
                        isToday ? "text-blue-600" : "text-gray-900"
                      }`}
                    >
                      {day}
                    </span>
                    {scheduledPosts.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {scheduledPosts.slice(0, 2).map((p) => (
                          <div
                            key={p.id}
                            className="text-xs px-1 py-0.5 rounded bg-purple-100 text-purple-700 truncate"
                          >
                            {p.platform}
                          </div>
                        ))}
                        {scheduledPosts.length > 2 && (
                          <span className="text-xs text-gray-400">
                            +{scheduledPosts.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Painel lateral */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Agendar post</h3>

              {draftPosts.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-gray-500 text-sm mb-3">Nenhum rascunho disponível</p>
                  <Link
                    href="/create-post"
                    className="text-blue-600 hover:underline text-sm font-medium"
                  >
                    Criar post
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Post
                    </label>
                    <select
                      value={selectedPost}
                      onChange={(e) => setSelectedPost(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    >
                      <option value="">Selecione um post</option>
                      {draftPosts.map((p) => (
                        <option key={p.id} value={p.id}>
                          [{p.platform}] {p.content?.slice(0, 40)}...
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data selecionada
                    </label>
                    <p className="text-sm text-gray-600">
                      {selectedDate
                        ? selectedDate.toLocaleDateString("pt-BR", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          })
                        : "Clique em um dia no calendário"}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Horário
                    </label>
                    <input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Recorrência
                    </label>
                    <select
                      value={recurrence}
                      onChange={(e) => setRecurrence(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    >
                      <option value="none">Sem recorrência</option>
                      <option value="daily">Diário</option>
                      <option value="weekly">Semanal</option>
                      <option value="biweekly">Quinzenal</option>
                      <option value="monthly">Mensal</option>
                    </select>
                  </div>

                  <button
                    onClick={handleSchedule}
                    disabled={!selectedPost || !selectedDate || loading}
                    className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 text-sm"
                  >
                    {loading ? "Agendando..." : "Agendar"}
                  </button>
                </div>
              )}
            </div>

            {/* Posts do dia selecionado */}
            {selectedDate && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h4 className="font-medium text-gray-900 mb-3">
                  Posts em {selectedDate.toLocaleDateString("pt-BR")}
                </h4>
                {getScheduledPostsForDay(selectedDate.getDate()).length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhum post agendado</p>
                ) : (
                  <div className="space-y-2">
                    {getScheduledPostsForDay(selectedDate.getDate()).map((p) => (
                      <div
                        key={p.id}
                        className="p-3 rounded-lg bg-gray-50 border border-gray-100"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-purple-600 capitalize">
                            {p.platform}
                          </span>
                          <span className="text-xs text-gray-400">
                            {p.scheduledAt &&
                              new Date(p.scheduledAt).toLocaleTimeString("pt-BR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 line-clamp-2">
                          {p.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

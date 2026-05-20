"use client";

import { useState } from "react";
import { BarChart2, CheckCircle2, AlertCircle, Loader2, Star } from "lucide-react";
import { Button } from "@client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";
import { cn } from "@server/lib/utils";

interface AuditResult {
  overallScore: number;
  components: Array<{ name: string; score: number; feedback: string }>;
  recommendations: string[];
  generatedAt: string;
}

function getScoreColor(score: number): string {
  if (score < 50) return "text-red-600";
  if (score < 75) return "text-yellow-600";
  return "text-green-600";
}

function getScoreBadgeClass(score: number): string {
  if (score < 50) return "bg-red-100 text-red-700 border border-red-200";
  if (score < 75) return "bg-yellow-100 text-yellow-700 border border-yellow-200";
  return "bg-green-100 text-green-700 border border-green-200";
}

function getProgressBarClass(score: number): string {
  if (score < 50) return "bg-red-500";
  if (score < 75) return "bg-yellow-500";
  return "bg-green-500";
}

export function ProfileAuditor() {
  const [bio, setBio] = useState("");
  const [followerCount, setFollowerCount] = useState<string>("");
  const [engagementRate, setEngagementRate] = useState<string>("");
  const [niche, setNiche] = useState("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch("/api/instagram/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bio,
          followerCount: Number(followerCount),
          engagementRate: Number(engagementRate),
          niche,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error ?? `Erro ${response.status}: não foi possível auditar o perfil.`);
      }

      const data: AuditResult = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocorreu um erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Form Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart2 className="h-5 w-5 text-blue-600" />
            Auditoria de Perfil Instagram
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Bio */}
            <div className="space-y-1.5">
              <label htmlFor="bio" className="block text-sm font-medium text-gray-700">
                Bio atual
              </label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                placeholder="Descreva sua bio atual do Instagram..."
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
              />
            </div>

            {/* Follower Count + Engagement Rate */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="followerCount" className="block text-sm font-medium text-gray-700">
                  Número de seguidores
                </label>
                <input
                  id="followerCount"
                  type="number"
                  min={0}
                  value={followerCount}
                  onChange={(e) => setFollowerCount(e.target.value)}
                  placeholder="Ex: 10000"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="engagementRate" className="block text-sm font-medium text-gray-700">
                  Taxa de engajamento (%)
                </label>
                <input
                  id="engagementRate"
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={engagementRate}
                  onChange={(e) => setEngagementRate(e.target.value)}
                  placeholder="Ex: 3.5"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            {/* Niche */}
            <div className="space-y-1.5">
              <label htmlFor="niche" className="block text-sm font-medium text-gray-700">
                Nicho
              </label>
              <input
                id="niche"
                type="text"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="Ex: moda feminina"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full gap-2"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Auditando perfil...
                </>
              ) : (
                <>
                  <Star className="h-4 w-4" />
                  Auditar Perfil
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading Spinner (standalone) */}
      {loading && !result && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          {/* Overall Score */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Star className="h-5 w-5 text-blue-600" />
                Pontuação Geral
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <span
                  className={cn(
                    "text-6xl font-bold tabular-nums",
                    getScoreColor(result.overallScore)
                  )}
                >
                  {result.overallScore}
                </span>
                <div className="space-y-1">
                  <span
                    className={cn(
                      "inline-block rounded-full px-3 py-1 text-sm font-semibold",
                      getScoreBadgeClass(result.overallScore)
                    )}
                  >
                    {result.overallScore < 50
                      ? "Precisa melhorar"
                      : result.overallScore < 75
                      ? "Bom"
                      : "Excelente"}
                  </span>
                  <p className="text-xs text-gray-400">
                    Auditado em{" "}
                    {new Date(result.generatedAt).toLocaleString("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Component Scores */}
          {result.components.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart2 className="h-5 w-5 text-blue-600" />
                  Componentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-4">
                  {result.components.map((component) => (
                    <li key={component.name} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-800">{component.name}</span>
                        <span
                          className={cn(
                            "font-semibold tabular-nums",
                            getScoreColor(component.score)
                          )}
                        >
                          {component.score}
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={cn("h-full rounded-full transition-all", getProgressBarClass(component.score))}
                          style={{ width: `${Math.min(100, Math.max(0, component.score))}%` }}
                        />
                      </div>
                      {component.feedback && (
                        <p className="text-xs text-gray-500">{component.feedback}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Recommendations */}
          {result.recommendations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Recomendações
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {result.recommendations.map((rec, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

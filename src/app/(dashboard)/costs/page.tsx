"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DollarSign, MessageSquare, ImageIcon, Zap, TrendingUp,
  PlusSquare, Calculator, Video, FileText, RefreshCw, Info,
} from "lucide-react";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";
import { Button } from "@client/components/ui/button";
import { Badge } from "@client/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";
import { Separator } from "@client/components/ui/separator";
import { cn } from "@server/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CostSummary {
  totalCost: number;
  textCost: number;
  imageCost: number;
  textGenerations: number;
  imageGenerations: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalImages: number;
}

interface DailyCost { date: string; text: number; image: number; total: number; }
interface CostLogEntry {
  id: string; type: string; model: string;
  inputTokens: number; outputTokens: number; images: number;
  costUsd: number; createdAt: string;
}

// ─── Preços de referência (USD por unidade) ───────────────────────────────────
// Estes valores refletem o custo médio por operação medido no sistema.

const PRICES = {
  // 1 post = geração de texto (Claude) + 3 opções de imagem (Stable Diffusion)
  // Texto: ~1k tokens in + 300 out  → ~$0.003 + $0.0045 = ~$0.0075
  // 3 imagens SD Ultra @ $0.08 cada  → $0.24
  // Total estimado por post: ~$0.25
  post: {
    text: 0.0075,    // Claude Sonnet por geração de legenda
    images: 0.24,    // 3 imagens × $0.08 (Stable Diffusion Ultra)
    total: 0.2475,
  },
  // 1 vídeo curto = extração + script (Claude) + frames SD + narração (Polly) + montagem
  // Script Claude: ~$0.015 | Frames SD (10 frames × $0.08): $0.80 | Polly Neural: ~$0.001
  // Total estimado por vídeo: ~$0.82
  video: {
    script: 0.015,
    frames: 0.80,    // 10 frames × $0.08
    narration: 0.001,
    total: 0.816,
  },
  // Infraestrutura AWS estimada (S3, transferência, etc.) por cliente/mês
  infra: 0.05,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number, currency = "USD") {
  if (currency === "BRL") {
    return `R$ ${(v * 5.8).toFixed(2).replace(".", ",")}`;
  }
  return `$${v.toFixed(4)}`;
}

function fmtShort(v: number) {
  return `$${v.toFixed(3)}`;
}

function fmtTokens(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toString();
}

// ─── Período ─────────────────────────────────────────────────────────────────

const periods = [
  { value: "week", label: "7 dias" },
  { value: "month", label: "Este mês" },
  { value: "year", label: "Este ano" },
  { value: "all", label: "Todo período" },
];

// ─── Simulador ───────────────────────────────────────────────────────────────

function BudgetSimulator() {
  const [posts, setPosts] = useState(8);
  const [videos, setVideos] = useState(2);
  const [currency, setCurrency] = useState<"USD" | "BRL">("BRL");

  const postCost    = posts  * PRICES.post.total;
  const videoCost   = videos * PRICES.video.total;
  const total       = postCost + videoCost + PRICES.infra;

  const breakdown = [
    { label: `${posts} posts`,       detail: `texto + 3 imagens cada`,      usd: postCost,       icon: FileText,  color: "text-blue-600",   bg: "bg-blue-50"   },
    { label: `${videos} vídeos`,     detail: `script + frames IA + narração`, usd: videoCost,    icon: Video,     color: "text-purple-600", bg: "bg-purple-50" },
    { label: "Infra AWS",            detail: `S3, transferência, Polly`,      usd: PRICES.infra,  icon: Zap,       color: "text-orange-600", bg: "bg-orange-50" },
  ];

  return (
    <Card className="border-blue-100 bg-gradient-to-br from-blue-50/50 to-white">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="h-4 w-4 text-blue-600" />
            Simulador de orçamento
          </CardTitle>
          <div className="flex gap-1 bg-white border border-gray-200 p-0.5 rounded-lg">
            {(["BRL", "USD"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={cn(
                  "px-2.5 py-1 rounded text-xs font-semibold transition-all",
                  currency === c ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-700"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Estime o custo de IA de um pacote mensal antes de fechar contrato
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Inputs */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-blue-500" />
              Posts / mês
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPosts(Math.max(0, posts - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 font-bold text-lg transition-colors"
              >−</button>
              <input
                type="number"
                min={0}
                value={posts}
                onChange={(e) => setPosts(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-16 text-center text-lg font-bold text-gray-900 border border-gray-200 rounded-lg py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => setPosts(posts + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 font-bold text-lg transition-colors"
              >+</button>
            </div>
            <p className="text-xs text-gray-400 mt-1">texto + 3 imagens cada</p>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block flex items-center gap-1.5">
              <Video className="h-3.5 w-3.5 text-purple-500" />
              Vídeos curtos / mês
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setVideos(Math.max(0, videos - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 font-bold text-lg transition-colors"
              >−</button>
              <input
                type="number"
                min={0}
                value={videos}
                onChange={(e) => setVideos(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-16 text-center text-lg font-bold text-gray-900 border border-gray-200 rounded-lg py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => setVideos(videos + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 font-bold text-lg transition-colors"
              >+</button>
            </div>
            <p className="text-xs text-gray-400 mt-1">script + 10 frames IA + narração</p>
          </div>
        </div>

        <Separator />

        {/* Breakdown */}
        <div className="space-y-2">
          {breakdown.map(({ label, detail, usd, icon: Icon, color, bg }) => (
            usd > 0 && (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn("flex h-7 w-7 items-center justify-center rounded-md", bg)}>
                    <Icon className={cn("h-3.5 w-3.5", color)} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">{label}</p>
                    <p className="text-xs text-gray-400">{detail}</p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-gray-700">
                  {fmt(usd, currency)}
                </span>
              </div>
            )
          ))}
        </div>

        <Separator />

        {/* Total */}
        <div className="flex items-center justify-between rounded-xl bg-blue-600 px-4 py-3 text-white">
          <div>
            <p className="text-sm font-medium text-blue-100">Custo total estimado de IA</p>
            <p className="text-xs text-blue-200 mt-0.5">por mês para este pacote</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{fmt(total, currency)}</p>
            {currency === "BRL" && (
              <p className="text-xs text-blue-200">{fmtShort(total)} USD</p>
            )}
          </div>
        </div>

        {/* Info note */}
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5">
          <Info className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 leading-relaxed">
            Estimativa baseada nos preços médios da AWS Bedrock (Claude Sonnet, Stable Diffusion Ultra) e Amazon Polly Neural.
            Cotação USD/BRL: R$ 5,80. O custo real pode variar com o tamanho dos textos e duração dos vídeos.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CostsPage() {
  const { data: session } = useSession();
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [daily, setDaily] = useState<DailyCost[]>([]);
  const [logs, setLogs] = useState<CostLogEntry[]>([]);
  const [period, setPeriod] = useState("month");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    fetch(`/api/costs?period=${period}`)
      .then((r) => r.json())
      .then((data: { summary: CostSummary; daily: DailyCost[]; logs: CostLogEntry[] }) => {
        setSummary(data.summary ?? null);
        setDaily(data.daily ?? []);
        setLogs(data.logs ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [session, period]);

  if (!session) return null;

  const maxDaily = Math.max(...daily.map((d) => d.total), 0.0001);

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Custos & Orçamento</h1>
          <p className="text-gray-500 mt-1">Simule pacotes e acompanhe o consumo real de IA</p>
        </div>
      </div>

      {/* ── Simulador sempre visível ── */}
      <div className="mb-8">
        <BudgetSimulator />
      </div>

      {/* ── Separador ── */}
      <div className="flex items-center gap-3 mb-6">
        <Separator className="flex-1" />
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Consumo real deste cliente</span>
        <Separator className="flex-1" />
      </div>

      {/* ── Filtro de período ── */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">Custo de IA gerado pela plataforma para este cliente</p>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                period === p.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <RefreshCw className="h-6 w-6 animate-spin" />
            <p className="text-sm">Carregando...</p>
          </div>
        </div>
      ) : !summary || summary.totalCost === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <DollarSign className="h-12 w-12 text-gray-200 mb-4" />
            <p className="text-gray-500 text-sm mb-1">Nenhum custo registrado neste período</p>
            <p className="text-gray-400 text-xs mb-4">Os custos aparecem aqui conforme você gera conteúdo para este cliente</p>
            <Button variant="default" size="sm" asChild>
              <Link href="/create-post"><PlusSquare className="h-4 w-4" />Gerar conteúdo</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                    <DollarSign className="h-4 w-4 text-gray-600" />
                  </div>
                  <p className="text-sm text-gray-500">Total gasto</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">${summary.totalCost.toFixed(4)}</p>
                <p className="text-xs text-gray-400 mt-1">≈ R$ {(summary.totalCost * 5.8).toFixed(2)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
                    <MessageSquare className="h-4 w-4 text-blue-600" />
                  </div>
                  <p className="text-sm text-gray-500">Texto (Claude)</p>
                </div>
                <p className="text-2xl font-bold text-blue-600">${summary.textCost.toFixed(4)}</p>
                <p className="text-xs text-gray-400 mt-1">{summary.textGenerations} gerações</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50">
                    <ImageIcon className="h-4 w-4 text-purple-600" />
                  </div>
                  <p className="text-sm text-gray-500">Imagens</p>
                </div>
                <p className="text-2xl font-bold text-purple-600">${summary.imageCost.toFixed(4)}</p>
                <p className="text-xs text-gray-400 mt-1">{summary.totalImages} imagens</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50">
                    <Zap className="h-4 w-4 text-orange-600" />
                  </div>
                  <p className="text-sm text-gray-500">Tokens</p>
                </div>
                <p className="text-2xl font-bold text-orange-600">
                  {fmtTokens(summary.totalInputTokens + summary.totalOutputTokens)}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {fmtTokens(summary.totalInputTokens)} in / {fmtTokens(summary.totalOutputTokens)} out
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Daily chart */}
          {daily.length > 0 && (
            <Card className="mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                  Custo diário
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-1 h-32 mt-2">
                  {daily.map((d) => {
                    const h = (d.total / maxDaily) * 100;
                    const textH = (d.text / maxDaily) * 100;
                    const imgH  = (d.image / maxDaily) * 100;
                    return (
                      <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative"
                        title={`${d.date}: $${d.total.toFixed(4)}`}
                      >
                        <div className="w-full flex flex-col justify-end" style={{ height: "100px" }}>
                          <div className="w-full rounded-t overflow-hidden" style={{ height: `${Math.max(h, 2)}%` }}>
                            <div className="w-full bg-blue-500" style={{ height: `${textH > 0 ? (textH / h) * 100 : 0}%` }} />
                            <div className="w-full bg-purple-500" style={{ height: `${imgH > 0 ? (imgH / h) * 100 : 0}%` }} />
                          </div>
                        </div>
                        <span className="text-xs text-gray-300">{d.date.slice(8)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-500" /><span className="text-xs text-gray-500">Texto</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-purple-500" /><span className="text-xs text-gray-500">Imagem</span></div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Logs table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Histórico detalhado</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {logs.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">Nenhuma geração neste período</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Data</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Tipo</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Modelo</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Uso</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Custo USD</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">≈ BRL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {logs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {new Date(log.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={log.type === "text" ? "default" : "purple"} className="gap-1">
                              {log.type === "text"
                                ? <><MessageSquare className="h-3 w-3" />Texto</>
                                : <><ImageIcon className="h-3 w-3" />Imagem</>
                              }
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                            {log.model.split(".").pop()?.split("-").slice(0, 3).join("-") ?? log.model}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {log.type === "text"
                              ? `${fmtTokens(log.inputTokens)} in / ${fmtTokens(log.outputTokens)} out`
                              : `${log.images} imagem${log.images !== 1 ? "s" : ""}`}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">
                            ${log.costUsd.toFixed(4)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-500 text-xs">
                            R$ {(log.costUsd * 5.8).toFixed(3)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </DashboardLayout>
  );
}

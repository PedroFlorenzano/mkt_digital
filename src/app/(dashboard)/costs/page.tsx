"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { DollarSign, MessageSquare, Image, Zap, TrendingUp, PlusSquare } from "lucide-react";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";
import { Button } from "@client/components/ui/button";
import { Badge } from "@client/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";
import { cn } from "@server/lib/utils";

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

const periods = [
  { value: "week", label: "7 dias" },
  { value: "month", label: "Este mês" },
  { value: "year", label: "Este ano" },
  { value: "all", label: "Todo período" },
];

function fmt(v: number) { return `$${v.toFixed(4)}`; }
function fmtTokens(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toString();
}

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
      .then((data) => {
        setSummary(data.summary);
        setDaily(data.daily ?? []);
        setLogs(data.logs ?? []);
        setLoading(false);
      });
  }, [session, period]);

  if (!session) return null;

  const maxDaily = Math.max(...daily.map((d) => d.total), 0.0001);

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Custos de IA</h1>
          <p className="text-gray-500 mt-1">Acompanhe o consumo de tokens e imagens</p>
        </div>
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
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : !summary ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <DollarSign className="h-12 w-12 text-gray-300 mb-4" />
            <p className="text-gray-500 mb-4">Nenhum dado de custo encontrado</p>
            <Button variant="gradient" asChild>
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
                <p className="text-2xl font-bold text-gray-900">{fmt(summary.totalCost)}</p>
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
                <p className="text-2xl font-bold text-blue-600">{fmt(summary.textCost)}</p>
                <p className="text-xs text-gray-400 mt-1">{summary.textGenerations} gerações</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50">
                    <Image className="h-4 w-4 text-purple-600" />
                  </div>
                  <p className="text-sm text-gray-500">Imagens</p>
                </div>
                <p className="text-2xl font-bold text-purple-600">{fmt(summary.imageCost)}</p>
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
                    const imgH = (d.image / maxDaily) * 100;
                    return (
                      <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group" title={`${d.date}: ${fmt(d.total)}`}>
                        <div className="w-full flex flex-col justify-end" style={{ height: "100px" }}>
                          <div className="w-full rounded-t overflow-hidden" style={{ height: `${Math.max(h, 2)}%` }}>
                            <div className="w-full bg-blue-500" style={{ height: `${textH > 0 ? (textH / h) * 100 : 0}%` }} />
                            <div className="w-full bg-purple-500" style={{ height: `${imgH > 0 ? (imgH / h) * 100 : 0}%` }} />
                          </div>
                        </div>
                        <span className="text-xs text-gray-400 hidden group-hover:block absolute -mt-6 bg-gray-800 text-white px-1.5 py-0.5 rounded text-xs whitespace-nowrap">
                          {fmt(d.total)}
                        </span>
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
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Custo</th>
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
                              {log.type === "text" ? <MessageSquare className="h-3 w-3" /> : <Image className="h-3 w-3" />}
                              {log.type === "text" ? "Texto" : "Imagem"}
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
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(log.costUsd)}</td>
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

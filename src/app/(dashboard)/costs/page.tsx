"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

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

interface DailyCost {
  date: string;
  text: number;
  image: number;
  total: number;
}

interface CostLogEntry {
  id: string;
  type: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  images: number;
  costUsd: number;
  createdAt: string;
}

export default function CostsPage() {
  const { data: session } = useSession();
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [daily, setDaily] = useState<DailyCost[]>([]);
  const [logs, setLogs] = useState<CostLogEntry[]>([]);
  const [period, setPeriod] = useState("month");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session) {
      loadCosts();
    }
  }, [session, period]);

  async function loadCosts() {
    setLoading(true);
    const res = await fetch(`/api/costs?period=${period}`);
    if (res.ok) {
      const data = await res.json();
      setSummary(data.summary);
      setDaily(data.daily);
      setLogs(data.logs);
    }
    setLoading(false);
  }

  function formatUsd(value: number) {
    return `$${value.toFixed(4)}`;
  }

  function formatTokens(value: number) {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toString();
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link href="/dashboard" className="text-xl font-bold text-blue-600">
              MKT Digital
            </Link>
            <span className="text-sm text-gray-600">{session.user?.name}</span>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Custos de IA</h2>
          <div className="flex gap-2">
            {[
              { value: "week", label: "7 dias" },
              { value: "month", label: "Mês" },
              { value: "year", label: "Ano" },
              { value: "all", label: "Total" },
            ].map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  period === p.value
                    ? "bg-blue-600 text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
          </div>
        ) : summary ? (
          <>
            {/* Cards de resumo */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-white p-6 rounded-xl border border-gray-200">
                <p className="text-sm font-medium text-gray-500">Custo Total</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {formatUsd(summary.totalCost)}
                </p>
              </div>
              <div className="bg-white p-6 rounded-xl border border-gray-200">
                <p className="text-sm font-medium text-gray-500">Texto (Claude)</p>
                <p className="text-2xl font-bold text-blue-600 mt-1">
                  {formatUsd(summary.textCost)}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {summary.textGenerations} gerações
                </p>
              </div>
              <div className="bg-white p-6 rounded-xl border border-gray-200">
                <p className="text-sm font-medium text-gray-500">Imagem (Nova Canvas)</p>
                <p className="text-2xl font-bold text-purple-600 mt-1">
                  {formatUsd(summary.imageCost)}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {summary.totalImages} imagens geradas
                </p>
              </div>
              <div className="bg-white p-6 rounded-xl border border-gray-200">
                <p className="text-sm font-medium text-gray-500">Tokens usados</p>
                <p className="text-lg font-bold text-gray-900 mt-1">
                  {formatTokens(summary.totalInputTokens + summary.totalOutputTokens)}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  In: {formatTokens(summary.totalInputTokens)} | Out: {formatTokens(summary.totalOutputTokens)}
                </p>
              </div>
            </div>

            {/* Gráfico de barras simples */}
            {daily.length > 0 && (
              <div className="bg-white p-6 rounded-xl border border-gray-200 mb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Custo diário</h3>
                <div className="flex items-end gap-1 h-40">
                  {daily.map((d) => {
                    const maxCost = Math.max(...daily.map((x) => x.total));
                    const height = maxCost > 0 ? (d.total / maxCost) * 100 : 0;
                    return (
                      <div
                        key={d.date}
                        className="flex-1 flex flex-col items-center gap-1"
                        title={`${d.date}: ${formatUsd(d.total)}`}
                      >
                        <div className="w-full flex flex-col justify-end" style={{ height: "120px" }}>
                          <div
                            className="w-full rounded-t bg-gradient-to-t from-blue-600 to-purple-500 transition-all"
                            style={{ height: `${Math.max(height, 2)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 rotate-[-45deg] origin-top-left whitespace-nowrap">
                          {d.date.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tabela de logs */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Histórico detalhado</h3>
              </div>
              {logs.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  Nenhuma geração registrada neste período.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Modelo</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tokens/Imgs</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Custo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {logs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {new Date(log.createdAt).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs px-2 py-1 rounded-full font-medium ${
                                log.type === "text"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-purple-100 text-purple-700"
                              }`}
                            >
                              {log.type === "text" ? "Texto" : "Imagem"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                            {log.model.split(".").pop()?.split("-").slice(0, 3).join("-") || log.model}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {log.type === "text"
                              ? `${formatTokens(log.inputTokens)} in / ${formatTokens(log.outputTokens)} out`
                              : `${log.images} img`}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                            {formatUsd(log.costUsd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <p className="text-gray-500">Nenhum dado de custo encontrado.</p>
            <Link
              href="/create-post"
              className="mt-4 inline-block text-blue-600 hover:underline font-medium"
            >
              Gerar seu primeiro conteúdo
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

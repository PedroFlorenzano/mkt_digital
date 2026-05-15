"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardList } from "lucide-react";
import { Button } from "@client/components/ui/button";
import { Badge } from "@client/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";
import { AuditFilters } from "./AuditLogFilters";

interface AuditLogEntry {
  id: string;
  campaignId: string | null;
  actionType: string;
  source: string;
  previousValues: string | null;
  newValues: string | null;
  requiresConfirmation: boolean;
  userDecision: string | null;
  createdAt: string;
}

interface PaginatedAuditResponse {
  data: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

interface AuditLogTableProps {
  filters: AuditFilters;
  onPageChange: (page: number) => void;
}

function formatJson(raw: string | null): string {
  if (!raw) return "—";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function UserDecisionBadge({ decision }: { decision: string | null }) {
  if (!decision) return null;
  if (decision === "approved") {
    return <Badge variant="success">Aprovado</Badge>;
  }
  if (decision === "rejected") {
    return <Badge variant="destructive">Rejeitado</Badge>;
  }
  return <span className="text-xs text-gray-400">{decision}</span>;
}

export function AuditLogTable({ filters, onPageChange }: AuditLogTableProps) {
  const [data, setData] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (filters.campaignId) params.set("campaignId", filters.campaignId);
    if (filters.actionType) params.set("actionType", filters.actionType);
    if (filters.since) params.set("since", filters.since);
    if (filters.until) params.set("until", filters.until);
    params.set("page", String(filters.page));
    params.set("pageSize", String(filters.pageSize));

    fetch(`/api/paid-traffic/audit?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Erro ${res.status}`);
        return res.json() as Promise<PaginatedAuditResponse>;
      })
      .then((result) => {
        setData(result.data ?? []);
        setTotal(result.total ?? 0);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message ?? "Erro ao carregar logs");
        setLoading(false);
      });
  }, [filters]);

  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const canPrev = filters.page > 1;
  const canNext = filters.page < totalPages;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-red-500 font-medium">Falha ao carregar logs de auditoria</p>
          <p className="text-xs text-gray-400 mt-1">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <ClipboardList className="h-12 w-12 text-gray-300 mb-4" />
          <p className="text-gray-500 text-sm">Nenhum registro encontrado</p>
          <p className="text-gray-400 text-xs mt-1">Tente ajustar os filtros</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {total} registro{total !== 1 ? "s" : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase whitespace-nowrap">
                  Data/Hora
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase whitespace-nowrap">
                  Tipo de Ação
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase whitespace-nowrap">
                  Campanha
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase whitespace-nowrap">
                  Valores Anteriores
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase whitespace-nowrap">
                  Valores Novos
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase whitespace-nowrap">
                  Origem
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase whitespace-nowrap">
                  Decisão do Usuário
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.map((log) => (
                <tr
                  key={log.id}
                  className="hover:bg-gray-50 transition-colors align-top"
                >
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {formatDate(log.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-mono text-gray-700">{log.actionType}</span>
                      {log.requiresConfirmation && (
                        <Badge variant="warning" className="w-fit">
                          Aguardando confirmação
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                    {log.campaignId ? (
                      <span title={log.campaignId}>
                        {log.campaignId.slice(0, 8)}…
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    {log.previousValues ? (
                      <pre className="text-xs text-gray-600 whitespace-pre-wrap break-all">
                        {formatJson(log.previousValues)}
                      </pre>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    {log.newValues ? (
                      <pre className="text-xs text-gray-600 whitespace-pre-wrap break-all">
                        {formatJson(log.newValues)}
                      </pre>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {log.source}
                  </td>
                  <td className="px-4 py-3">
                    <UserDecisionBadge decision={log.userDecision} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            Página {filters.page} de {totalPages} · {total} registro{total !== 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(filters.page - 1)}
              disabled={!canPrev}
              className="gap-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(filters.page + 1)}
              disabled={!canNext}
              className="gap-1"
            >
              Próxima
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

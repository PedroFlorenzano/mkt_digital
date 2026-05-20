"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, AlertCircle, Inbox } from "lucide-react";
import { Button } from "@client/components/ui/button";
import { Badge } from "@client/components/ui/badge";
import { Card, CardContent } from "@client/components/ui/card";
import { CampaignMetricsBadge } from "./CampaignMetricsBadge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdMetricSnapshot {
  id: string;
  ctr: number;
  cpc: number;
  roas: number;
  spendBrl: number;
  impressions: number;
  clicks: number;
  conversions: number;
  collectedAt: string;
}

interface AdCampaign {
  id: string;
  name: string;
  platform: string;
  status: string;
  dailyBudgetBrl: number;
  managerUrl: string;
  latestMetrics?: AdMetricSnapshot | null;
}

interface CampaignsResponse {
  data: AdCampaign[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Status badge helpers
// ---------------------------------------------------------------------------

const statusConfig: Record<string, { label: string; className: string }> = {
  active: { label: "Ativa", className: "border-transparent bg-green-100 text-green-700" },
  paused: { label: "Pausada", className: "border-transparent bg-orange-100 text-orange-700" },
  error: { label: "Erro", className: "border-transparent bg-red-100 text-red-700" },
  draft: { label: "Rascunho", className: "border-transparent bg-gray-100 text-gray-600" },
};

const platformLabels: Record<string, string> = {
  meta: "Meta Ads",
  google: "Google Ads",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CampaignListTable() {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(`/api/paid-traffic/campaigns?page=${page}&pageSize=${pageSize}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `Erro ${res.status}`);
        }
        return res.json() as Promise<CampaignsResponse>;
      })
      .then((data) => {
        setCampaigns(data.data);
        setTotal(data.total);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Erro ao carregar campanhas");
        setLoading(false);
      });
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="text-sm text-red-600 font-medium">{error}</p>
          <Button variant="outline" size="sm" onClick={() => setPage(1)}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Empty ─────────────────────────────────────────────────────────────────
  if (campaigns.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
          <Inbox className="h-10 w-10 text-gray-300" />
          <p className="text-gray-500 font-medium">Nenhuma campanha encontrada</p>
          <p className="text-gray-400 text-sm">Crie sua primeira campanha com IA clicando em &quot;Nova Campanha&quot;.</p>
        </CardContent>
      </Card>
    );
  }

  // ── Table ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Nome</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Plataforma</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">CTR</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">CPC</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">ROAS</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Orçamento Diário</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">Link</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {campaigns.map((campaign) => {
              const status = statusConfig[campaign.status] ?? { label: campaign.status, className: "border-transparent bg-gray-100 text-gray-600" };
              const metrics = campaign.latestMetrics;

              return (
                <tr key={campaign.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">
                    {campaign.name}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {platformLabels[campaign.platform] ?? campaign.platform}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={status.className}>{status.label}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <CampaignMetricsBadge
                      label="CTR"
                      value={metrics?.ctr}
                      type="ctr"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <CampaignMetricsBadge
                      label="CPC"
                      value={metrics?.cpc}
                      type="cpc"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <CampaignMetricsBadge
                      label="ROAS"
                      value={metrics?.roas}
                      type="roas"
                    />
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 font-mono">
                    R${campaign.dailyBudgetBrl.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <a
                      href={campaign.managerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium"
                    >
                      Ver
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>
          Página {page} de {totalPages}
        </span>
        <div className="flex items-center gap-2">
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
    </div>
  );
}

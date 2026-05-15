"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@client/components/ui/button";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { Card, CardContent } from "@client/components/ui/card";

export interface AuditFilters {
  campaignId?: string;
  actionType?: string;
  since?: string;
  until?: string;
  page: number;
  pageSize: number;
}

interface AuditLogFiltersProps {
  filters: AuditFilters;
  onChange: (filters: AuditFilters) => void;
}

export function AuditLogFilters({ filters, onChange }: AuditLogFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [local, setLocal] = useState<Omit<AuditFilters, "page" | "pageSize">>({
    campaignId: filters.campaignId ?? "",
    actionType: filters.actionType ?? "",
    since: filters.since ?? "",
    until: filters.until ?? "",
  });

  // Sync local state when URL params change externally
  useEffect(() => {
    setLocal({
      campaignId: filters.campaignId ?? "",
      actionType: filters.actionType ?? "",
      since: filters.since ?? "",
      until: filters.until ?? "",
    });
  }, [filters.campaignId, filters.actionType, filters.since, filters.until]);

  function applyFilters() {
    const params = new URLSearchParams(searchParams.toString());

    if (local.campaignId) {
      params.set("campaignId", local.campaignId);
    } else {
      params.delete("campaignId");
    }

    if (local.actionType) {
      params.set("actionType", local.actionType);
    } else {
      params.delete("actionType");
    }

    if (local.since) {
      params.set("since", local.since);
    } else {
      params.delete("since");
    }

    if (local.until) {
      params.set("until", local.until);
    } else {
      params.delete("until");
    }

    // Reset to page 1 when filters change
    params.set("page", "1");

    router.push(`?${params.toString()}`);

    onChange({
      campaignId: local.campaignId || undefined,
      actionType: local.actionType || undefined,
      since: local.since || undefined,
      until: local.until || undefined,
      page: 1,
      pageSize: filters.pageSize,
    });
  }

  function clearFilters() {
    setLocal({ campaignId: "", actionType: "", since: "", until: "" });

    const params = new URLSearchParams();
    params.set("page", "1");
    router.push(`?${params.toString()}`);

    onChange({
      page: 1,
      pageSize: filters.pageSize,
    });
  }

  const hasActiveFilters =
    !!filters.campaignId ||
    !!filters.actionType ||
    !!filters.since ||
    !!filters.until;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filter-campaign">ID da Campanha</Label>
            <Input
              id="filter-campaign"
              placeholder="Ex: clxxxxxx"
              value={local.campaignId ?? ""}
              onChange={(e) => setLocal((prev) => ({ ...prev, campaignId: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filter-action">Tipo de Ação</Label>
            <Input
              id="filter-action"
              placeholder="Ex: budget_updated"
              value={local.actionType ?? ""}
              onChange={(e) => setLocal((prev) => ({ ...prev, actionType: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filter-since">De</Label>
            <Input
              id="filter-since"
              type="date"
              value={local.since ?? ""}
              onChange={(e) => setLocal((prev) => ({ ...prev, since: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filter-until">Até</Label>
            <Input
              id="filter-until"
              type="date"
              value={local.until ?? ""}
              onChange={(e) => setLocal((prev) => ({ ...prev, until: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4">
          <Button onClick={applyFilters} variant="default" size="sm" className="gap-1.5">
            <Search className="h-3.5 w-3.5" />
            Filtrar
          </Button>
          {hasActiveFilters && (
            <Button onClick={clearFilters} variant="outline" size="sm" className="gap-1.5">
              <X className="h-3.5 w-3.5" />
              Limpar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

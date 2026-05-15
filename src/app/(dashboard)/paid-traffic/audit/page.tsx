"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";
import { AuditLogFilters, AuditFilters } from "@client/components/paid-traffic/audit/AuditLogFilters";
import { AuditLogTable } from "@client/components/paid-traffic/audit/AuditLogTable";

const PAGE_SIZE = 20;

function AuditPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [filters, setFilters] = useState<AuditFilters>(() => ({
    campaignId: searchParams.get("campaignId") ?? undefined,
    actionType: searchParams.get("actionType") ?? undefined,
    since: searchParams.get("since") ?? undefined,
    until: searchParams.get("until") ?? undefined,
    page: Number(searchParams.get("page") ?? 1),
    pageSize: PAGE_SIZE,
  }));

  // Sync filters from URL on mount and URL changes
  useEffect(() => {
    setFilters({
      campaignId: searchParams.get("campaignId") ?? undefined,
      actionType: searchParams.get("actionType") ?? undefined,
      since: searchParams.get("since") ?? undefined,
      until: searchParams.get("until") ?? undefined,
      page: Number(searchParams.get("page") ?? 1),
      pageSize: PAGE_SIZE,
    });
  }, [searchParams]);

  function handleFiltersChange(newFilters: AuditFilters) {
    setFilters(newFilters);
  }

  function handlePageChange(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    router.push(`?${params.toString()}`);
    setFilters((prev) => ({ ...prev, page }));
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
            <ClipboardList className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Log de Auditoria</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Histórico completo de ações automatizadas e decisões do usuário
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <AuditLogFilters filters={filters} onChange={handleFiltersChange} />
        <AuditLogTable filters={filters} onPageChange={handlePageChange} />
      </div>
    </DashboardLayout>
  );
}

export default function AuditPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout>
          <div className="flex items-center justify-center h-64">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          </div>
        </DashboardLayout>
      }
    >
      <AuditPageContent />
    </Suspense>
  );
}

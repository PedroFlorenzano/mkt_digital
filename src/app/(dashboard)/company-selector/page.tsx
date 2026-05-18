"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Building2, Plus, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@client/components/ui/button";
import { CompanySelectorCard } from "@client/components/company/CompanySelectorCard";
import type { CompanySummary } from "@/types/company";

export default function CompanySelectorPage() {
  const router = useRouter();
  const { data: session, update: updateSession } = useSession();

  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);

  // ── Load portfolio
  const loadCompanies = useCallback(async () => {
    setIsLoadingCompanies(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/companies");
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setLoadError(json.error ?? `Erro ao carregar clientes (HTTP ${res.status})`);
        return;
      }
      const data = (await res.json()) as CompanySummary[];
      setCompanies(data);
    } catch {
      setLoadError("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setIsLoadingCompanies(false);
    }
  }, []);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  // ── Select a company
  const handleSelect = async (companyId: string) => {
    if (selectingId) return;
    setSelectingId(companyId);
    setSelectError(null);
    try {
      const res = await fetch("/api/companies/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setSelectError(json.error ?? "Erro ao selecionar cliente. Tente novamente.");
        return;
      }
      await updateSession({ activeCompanyId: companyId });
      // Hard navigation to ensure the middleware reads the updated JWT cookie.
      // router.push() is client-side and may fire before the new cookie is set.
      window.location.href = "/dashboard";
    } catch {
      setSelectError("Erro de conexão. Tente novamente.");
    } finally {
      setSelectingId(null);
    }
  };

  if (!session) return null;

  if (isLoadingCompanies) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-sm">Carregando clientes…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-12 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 mx-auto mb-4">
            <Building2 className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Selecione o cliente</h1>
          <p className="text-sm text-gray-500 mt-1">
            Escolha qual conta você vai gerenciar agora
          </p>
        </div>

        {/* Load error */}
        {loadError && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <div className="flex-1">
              <p className="text-sm text-red-700">{loadError}</p>
              <button
                onClick={() => void loadCompanies()}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700"
              >
                <RefreshCw className="h-3 w-3" />
                Tentar novamente
              </button>
            </div>
          </div>
        )}

        {/* Select error */}
        {selectError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
            <p className="text-sm text-red-700">{selectError}</p>
          </div>
        )}

        {/* Empty state */}
        {!loadError && companies.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 mx-auto mb-4">
              <Building2 className="h-7 w-7 text-blue-400" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              Nenhum cliente cadastrado
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Adicione o primeiro cliente para começar.
            </p>
            <Button onClick={() => router.push("/onboarding?mode=create")}>
              <Plus className="h-4 w-4" />
              Adicionar primeiro cliente
            </Button>
          </div>
        ) : (
          <>
            <div
              role="listbox"
              aria-label="Clientes"
              className="flex flex-col gap-3 mb-6"
            >
              {companies.map((company) => (
                <div key={company.id} className="relative">
                  {selectingId === company.id && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/70">
                      <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                    </div>
                  )}
                  <CompanySelectorCard
                    company={company}
                    isActive={session.user?.activeCompanyId === company.id}
                    isLoading={false}
                    onClick={() => void handleSelect(company.id)}
                  />
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              onClick={() => router.push("/onboarding?mode=create")}
              className="w-full"
            >
              <Plus className="h-4 w-4" />
              Adicionar cliente
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

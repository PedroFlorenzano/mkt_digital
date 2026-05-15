"use client";

import { Button } from "@client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";

interface AllocationItem {
  campaignId: string;
  campaignName: string;
  currentBudget: number;
  newBudget: number;
}

interface ConfirmedAllocation {
  campaignId: string;
  newDailyBudgetBrl: number;
}

interface BudgetConfirmModalProps {
  allocations: AllocationItem[];
  onConfirm: (selectedAllocations: ConfirmedAllocation[]) => void;
  onCancel: () => void;
  isLoading: boolean;
}

function fmtBrl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function BudgetConfirmModal({
  allocations,
  onConfirm,
  onCancel,
  isLoading,
}: BudgetConfirmModalProps) {
  function handleConfirm() {
    const selected: ConfirmedAllocation[] = allocations.map((a) => ({
      campaignId: a.campaignId,
      newDailyBudgetBrl: a.newBudget,
    }));
    onConfirm(selected);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="budget-confirm-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Modal content */}
      <Card className="relative z-10 w-full max-w-lg mx-4 shadow-xl">
        <CardHeader className="pb-3">
          <CardTitle id="budget-confirm-title" className="text-base">
            Confirmar alterações de orçamento
          </CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            Uma ou mais campanhas possuem orçamento recomendado acima de R$&nbsp;500. Revise as
            alterações antes de confirmar.
          </p>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-gray-100">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 uppercase">
                    Campanha
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400 uppercase">
                    Atual
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400 uppercase">
                    Novo
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {allocations.map((item) => (
                  <tr key={item.campaignId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-700 font-medium truncate max-w-[180px]">
                      {item.campaignName}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {fmtBrl(item.currentBudget)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {fmtBrl(item.newBudget)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2 px-4 py-4 border-t border-gray-100">
            <Button variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={isLoading}>
              {isLoading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Aplicando...
                </>
              ) : (
                "Confirmar"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

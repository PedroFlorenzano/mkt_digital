import { DashboardLayout } from "@client/components/layout/dashboard-layout";
import { BudgetComparisonTable } from "@client/components/paid-traffic/budget/BudgetComparisonTable";
import { DollarSign } from "lucide-react";

export default function BudgetPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-5 w-5 text-green-600" />
            <h1 className="text-2xl font-bold text-gray-900">Inteligência de Orçamento</h1>
          </div>
          <p className="text-gray-500 mt-1 max-w-2xl">
            Calcula e aplica o orçamento diário ideal para cada campanha ativa com base no ROAS ponderado
            dos últimos 30 dias. Diferente da Análise Estratégica — que diagnostica e sugere — esta ferramenta
            executa: as mudanças são enviadas diretamente para Meta Ads e Google Ads. Ajustes abaixo de
            R$&thinsp;500/dia são aplicados automaticamente; acima desse valor é solicitada confirmação.
          </p>
        </div>
        <BudgetComparisonTable />
      </div>
    </DashboardLayout>
  );
}

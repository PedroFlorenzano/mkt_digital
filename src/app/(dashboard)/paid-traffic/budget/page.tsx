import { BudgetComparisonTable } from "@client/components/paid-traffic/budget/BudgetComparisonTable";

export default function BudgetPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Inteligência de Orçamento</h1>
        <p className="text-gray-500 mt-1">Recomendações geradas por IA com base na performance das suas campanhas.</p>
      </div>
      <BudgetComparisonTable />
    </div>
  );
}

"use client";

interface RuleExecutionHistoryProps {
  companyId?: string;
}

export function RuleExecutionHistory({ companyId: _companyId }: RuleExecutionHistoryProps) {
  return (
    <p className="text-sm text-gray-500 py-4 text-center">
      Histórico de execuções disponível em breve.
    </p>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Plus, ChevronUp } from "lucide-react";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";
import { Button } from "@client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";
import { Separator } from "@client/components/ui/separator";
import { RuleCreateForm } from "@client/components/paid-traffic/rules/RuleCreateForm";
import { RuleList, type AutomationRule } from "@client/components/paid-traffic/rules/RuleList";
import { RuleExecutionHistory } from "@client/components/paid-traffic/rules/RuleExecutionHistory";

export default function RulesPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const fetchRules = () => {
    setLoading(true);
    fetch("/api/paid-traffic/rules")
      .then((r) => r.json())
      .then((data: unknown) => {
        setRules(Array.isArray(data) ? (data as AutomationRule[]) : []);
      })
      .catch(() => setRules([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleRuleCreated = () => {
    setShowForm(false);
    fetchRules();
  };

  return (
    <DashboardLayout>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Regras de Automação</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Crie regras para automatizar ações nas suas campanhas de tráfego pago.
          </p>
        </div>
        <Button
          variant={showForm ? "outline" : "default"}
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? (
            <>
              <ChevronUp className="h-4 w-4" />
              Fechar
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Nova Regra
            </>
          )}
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Nova Regra de Automação</CardTitle>
          </CardHeader>
          <CardContent>
            <RuleCreateForm onSuccess={handleRuleCreated} />
          </CardContent>
        </Card>
      )}

      {/* Rules list */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Regras Cadastradas</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
          ) : (
            <RuleList rules={rules} />
          )}
        </CardContent>
      </Card>

      <Separator className="my-6" />

      {/* Execution history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de Execuções</CardTitle>
        </CardHeader>
        <CardContent>
          <RuleExecutionHistory />
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}

"use client";

import Link from "next/link";
import { PlusCircle, KeyRound, Bot, DollarSign, ClipboardList, Sparkles } from "lucide-react";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";
import { Button } from "@client/components/ui/button";
import { Separator } from "@client/components/ui/separator";
import { CampaignListTable } from "@client/components/paid-traffic/dashboard/CampaignListTable";
import { StrategicDashboard } from "@client/components/StrategicDashboard";

export default function PaidTrafficPage() {
  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tráfego Pago com IA</h1>
          <p className="text-gray-500 mt-1">Gerencie e otimize suas campanhas de anúncios pagos</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" asChild>
            <Link href="/paid-traffic/credentials">
              <KeyRound className="h-4 w-4" />
              Gerenciar Credenciais
            </Link>
          </Button>
          <Button variant="gradient" asChild>
            <Link href="/paid-traffic/new">
              <PlusCircle className="h-4 w-4" />
              Nova Campanha
            </Link>
          </Button>
        </div>
      </div>

      <Separator className="mb-6" />

      {/* Campaign list */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Campanhas</h2>
        <CampaignListTable />
      </div>

      <Separator className="mb-6" />

      {/* Tools section */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Ferramentas de Otimização</h2>
        <p className="text-sm text-gray-500 mb-5">
          Cada ferramenta atua em uma etapa diferente do processo. Use em sequência para melhores resultados.
        </p>

        {/* How it works — flow explanation */}
        <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-2">
          <div className="flex items-center gap-2 shrink-0 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2">
            <Sparkles className="h-4 w-4 text-indigo-600 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-indigo-800">1. Análise Estratégica</p>
              <p className="text-xs text-indigo-600">Diagnostica o portfólio e sugere 3 ações</p>
            </div>
          </div>
          <div className="text-gray-300 text-lg shrink-0">→</div>
          <div className="flex items-center gap-2 shrink-0 rounded-xl border border-green-200 bg-green-50 px-3.5 py-2">
            <DollarSign className="h-4 w-4 text-green-600 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-green-800">2. Inteligência de Orçamento</p>
              <p className="text-xs text-green-600">Calcula e aplica o valor certo por campanha</p>
            </div>
          </div>
          <div className="text-gray-300 text-lg shrink-0">→</div>
          <div className="flex items-center gap-2 shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2">
            <Bot className="h-4 w-4 text-blue-600 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-blue-800">3. Regras de Automação</p>
              <p className="text-xs text-blue-600">Executa ajustes automaticamente no futuro</p>
            </div>
          </div>
          <div className="text-gray-300 text-lg shrink-0">→</div>
          <div className="flex items-center gap-2 shrink-0 rounded-xl border border-purple-200 bg-purple-50 px-3.5 py-2">
            <ClipboardList className="h-4 w-4 text-purple-600 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-purple-800">4. Log de Auditoria</p>
              <p className="text-xs text-purple-600">Registra cada decisão tomada</p>
            </div>
          </div>
        </div>

        {/* Tool cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Análise Estratégica */}
          <a
            href="#strategic"
            className="flex flex-col gap-3 rounded-xl border border-indigo-100 bg-white p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 group-hover:bg-indigo-100 transition-colors shrink-0">
                <Sparkles className="h-5 w-5 text-indigo-600" />
              </div>
              <p className="font-semibold text-gray-900 text-sm">Análise Estratégica</p>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Avalia CTR, ROAS e CPC de todas as campanhas e entrega um diagnóstico com pontos fortes, alertas e 3 mudanças de rota acionáveis.
            </p>
            <span className="text-xs font-medium text-indigo-600">Use quando quiser entender o panorama geral →</span>
          </a>

          {/* Inteligência de Orçamento */}
          <Link
            href="/paid-traffic/budget"
            className="flex flex-col gap-3 rounded-xl border border-green-100 bg-white p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 group-hover:bg-green-100 transition-colors shrink-0">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <p className="font-semibold text-gray-900 text-sm">Inteligência de Orçamento</p>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Calcula o orçamento diário ideal para cada campanha com base no ROAS dos últimos 30 dias e aplica as mudanças diretamente no Meta Ads e Google Ads.
            </p>
            <span className="text-xs font-medium text-green-600">Use quando quiser executar ajustes de verba →</span>
          </Link>

          {/* Regras de Automação */}
          <Link
            href="/paid-traffic/rules"
            className="flex flex-col gap-3 rounded-xl border border-blue-100 bg-white p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 group-hover:bg-blue-100 transition-colors shrink-0">
                <Bot className="h-5 w-5 text-blue-600" />
              </div>
              <p className="font-semibold text-gray-900 text-sm">Regras de Automação</p>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Define gatilhos automáticos: se CTR cair abaixo de X% ou ROAS subir acima de Y, a plataforma age sem precisar de intervenção manual.
            </p>
            <span className="text-xs font-medium text-blue-600">Use para otimização contínua em piloto automático →</span>
          </Link>

          {/* Log de Auditoria */}
          <Link
            href="/paid-traffic/audit"
            className="flex flex-col gap-3 rounded-xl border border-purple-100 bg-white p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 group-hover:bg-purple-100 transition-colors shrink-0">
                <ClipboardList className="h-5 w-5 text-purple-600" />
              </div>
              <p className="font-semibold text-gray-900 text-sm">Log de Auditoria</p>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Histórico imutável de todas as ações: ajustes de orçamento, campanhas pausadas, mudanças de rota aplicadas e decisões aguardando aprovação.
            </p>
            <span className="text-xs font-medium text-purple-600">Consulte para rastrear o que foi feito e por quem →</span>
          </Link>

        </div>
      </div>

      <Separator className="my-8" />

      {/* Strategic analysis — inline section */}
      <section id="strategic">
        <StrategicDashboard />
      </section>
    </DashboardLayout>
  );
}

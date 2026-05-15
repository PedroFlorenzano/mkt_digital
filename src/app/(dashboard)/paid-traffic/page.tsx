"use client";

import Link from "next/link";
import { PlusCircle, KeyRound, Bot, DollarSign, ClipboardList } from "lucide-react";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";
import { Button } from "@client/components/ui/button";
import { Separator } from "@client/components/ui/separator";
import { CampaignListTable } from "@client/components/paid-traffic/dashboard/CampaignListTable";

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

      {/* Navigation links to sub-pages */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Ferramentas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            href="/paid-traffic/rules"
            className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 group"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 group-hover:bg-blue-100 transition-colors">
              <Bot className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">Regras de Automação</p>
              <p className="text-xs text-gray-500 mt-0.5">Automatize decisões de otimização</p>
            </div>
          </Link>

          <Link
            href="/paid-traffic/budget"
            className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 group"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 group-hover:bg-green-100 transition-colors">
              <DollarSign className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">Inteligência de Orçamento</p>
              <p className="text-xs text-gray-500 mt-0.5">Redistribuição inteligente de verba</p>
            </div>
          </Link>

          <Link
            href="/paid-traffic/audit"
            className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 group"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 group-hover:bg-purple-100 transition-colors">
              <ClipboardList className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">Log de Auditoria</p>
              <p className="text-xs text-gray-500 mt-0.5">Histórico de todas as ações</p>
            </div>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}

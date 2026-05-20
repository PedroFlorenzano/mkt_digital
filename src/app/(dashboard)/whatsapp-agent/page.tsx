"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BotMessageSquare, PlusCircle, X } from "lucide-react";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";
import { Button } from "@client/components/ui/button";
import { Separator } from "@client/components/ui/separator";
import { AgentList } from "@client/components/whatsapp-agent/AgentList";
import { AgentForm } from "@client/components/whatsapp-agent/AgentForm";

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

export default function WhatsAppAgentPage() {
  const router = useRouter();
  const [showCreateModal, setShowCreateModal] = useState(false);
  // Key to force AgentList to re-fetch after a successful create
  const [listKey, setListKey] = useState(0);

  function handleCreateAgent() {
    setShowCreateModal(true);
  }

  function handleEditAgent(agentId: string) {
    router.push(`/whatsapp-agent/${agentId}`);
  }

  function handleCreateSuccess() {
    setShowCreateModal(false);
    // Increment key to remount AgentList, triggering a fresh fetch
    setListKey((k) => k + 1);
  }

  return (
    <DashboardLayout>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50">
            <BotMessageSquare className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Agente WhatsApp IA</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Configure e gerencie seus agentes de atendimento automático via WhatsApp
            </p>
          </div>
        </div>
        <Button onClick={handleCreateAgent} className="gap-2">
          <PlusCircle className="h-4 w-4" />
          Novo Agente
        </Button>
      </div>

      <Separator className="mb-6" />

      {/* ── How it works ── */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 mb-6">
        <p className="text-sm font-semibold text-blue-900 mb-2">Como funciona</p>
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>Crie uma instância na sua <strong>EvolutionAPI</strong> e conecte um número WhatsApp.</li>
          <li>Clique em <strong>Novo Agente</strong>, preencha o nome da instância, a URL e a chave da API.</li>
          <li>Copie a <strong>URL do Webhook</strong> gerada e cole nas configurações de webhook da instância na EvolutionAPI.</li>
          <li>Escreva o <strong>System Prompt</strong> explicando ao agente como ele deve se comportar e responder seus clientes.</li>
        </ol>
      </div>

      {/* ── Agent list ── */}
      <AgentList
        key={listKey}
        onCreateAgent={handleCreateAgent}
        onEditAgent={handleEditAgent}
      />

      {/* ── Create Agent Modal ── */}
      {showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-agent-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
            aria-hidden="true"
          />

          {/* Panel */}
          <div className="relative z-10 w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2
                id="create-agent-modal-title"
                className="text-lg font-semibold text-gray-900"
              >
                Novo Agente WhatsApp
              </h2>
              <button
                aria-label="Fechar"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 overflow-y-auto max-h-[75vh]">
              <AgentForm
                onSuccess={handleCreateSuccess}
                onCancel={() => setShowCreateModal(false)}
              />
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

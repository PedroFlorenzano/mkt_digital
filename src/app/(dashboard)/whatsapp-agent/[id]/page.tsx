import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { authOptions } from "@server/lib/auth";
import { agentService } from "@server/services/agent.service";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";
import { Button } from "@client/components/ui/button";
import { Separator } from "@client/components/ui/separator";
import { AgentEditClient } from "@client/components/whatsapp-agent/AgentEditClient";

// ─────────────────────────────────────────────
// Page props
// ─────────────────────────────────────────────

interface PageProps {
  params: Promise<{ id: string }>;
}

// ─────────────────────────────────────────────
// Server component
// ─────────────────────────────────────────────

/**
 * Agent detail / edit page — server component.
 *
 * Fetches the agent by [id] after validating the session and ownership.
 * Renders AgentForm pre-populated with the existing agent values.
 *
 * Requirements: 2.2, 4.2
 */
export default async function WhatsAppAgentEditPage({ params }: PageProps) {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;

  // 2. Fetch agent — assert ownership so unauthorised access returns 404
  let agent: Awaited<ReturnType<typeof agentService.assertOwnership>>;
  try {
    agent = await agentService.assertOwnership(session.user.id, id);
  } catch {
    // NotFoundError or ForbiddenError → treat as 404 to prevent enumeration
    notFound();
  }

  // 3. Map Prisma model → AgentForm initial values
  const initialValues = {
    name: agent.name,
    description: agent.description ?? "",
    instanceName: agent.instanceName,
    evolutionApiUrl: agent.evolutionApiUrl,
    evolutionApiKey: agent.evolutionApiKey,
    systemPrompt: agent.systemPrompt,
    delaySeconds: agent.delaySeconds,
    maxMessagesPerSession: agent.maxMessagesPerSession,
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* ── Navigation bar ── */}
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href="/whatsapp-agent">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Link>
          </Button>

          <Button variant="outline" size="sm" asChild>
            <Link href={`/whatsapp-agent/${id}/conversations`}>
              <MessageSquare className="h-4 w-4" />
              Ver conversas
            </Link>
          </Button>
        </div>

        {/* ── Page header ── */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Editar agente</h1>
          <p className="text-sm text-gray-500 mt-1">
            {agent.name}
            {agent.instanceName && (
              <span className="ml-2 font-mono text-xs text-gray-400">
                · {agent.instanceName}
              </span>
            )}
          </p>
        </div>

        <Separator />

        {/* ── Edit form (client component) ── */}
        <AgentEditClient agentId={id} initialValues={initialValues} />
      </div>
    </DashboardLayout>
  );
}

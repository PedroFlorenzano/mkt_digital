"use client";

import { useRouter } from "next/navigation";
import { AgentForm, type AgentFormValues } from "./AgentForm";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface AgentEditClientProps {
  agentId: string;
  initialValues: Partial<AgentFormValues>;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

/**
 * Thin client wrapper around AgentForm for edit mode.
 * Handles post-save and cancel navigation using the Next.js router.
 * This wrapper is required because server components cannot pass function props
 * directly to client components (functions are not serialisable).
 */
export function AgentEditClient({ agentId, initialValues }: AgentEditClientProps) {
  const router = useRouter();

  function handleSuccess(_agent: AgentFormValues & { id: string }) {
    router.push("/whatsapp-agent");
  }

  function handleCancel() {
    router.push("/whatsapp-agent");
  }

  return (
    <AgentForm
      agentId={agentId}
      initialValues={initialValues}
      onSuccess={handleSuccess}
      onCancel={handleCancel}
    />
  );
}

/**
 * agent.repository.ts
 *
 * Data access layer for the WhatsAppAgent model.
 * Surfaces Prisma P2002 (unique constraint violation) as ConflictError so the
 * service layer never has to inspect raw Prisma error codes.
 */

import { Prisma } from "@prisma/client";
import type { WhatsAppAgent } from "@prisma/client";
import { prisma } from "@server/lib/prisma";
import { ConflictError } from "@server/lib/errors";

// ─────────────────────────────────────────────
// Input types
// ─────────────────────────────────────────────

export interface CreateAgentData {
  companyId: string;
  name: string;
  description?: string | null;
  instanceName: string;
  evolutionApiUrl: string;
  evolutionApiKey: string;
  systemPrompt: string;
  delaySeconds?: number;
  maxMessagesPerSession?: number;
  /** Defaults to "active" when omitted. */
  status?: string;
}

export interface UpdateAgentData {
  name?: string;
  description?: string | null;
  instanceName?: string;
  evolutionApiUrl?: string;
  evolutionApiKey?: string;
  systemPrompt?: string;
  delaySeconds?: number;
  maxMessagesPerSession?: number;
}

// ─────────────────────────────────────────────
// Helper — wraps Prisma writes to convert P2002 → ConflictError
// ─────────────────────────────────────────────

async function handleUniqueConstraint<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new ConflictError(
        "An agent with the same instanceName already exists for this company.",
      );
    }
    throw err;
  }
}

// ─────────────────────────────────────────────
// Repository
// ─────────────────────────────────────────────

export const agentRepository = {
  /**
   * Returns all agents belonging to `companyId`, ordered by creation date
   * (most recent first).
   *
   * Post-conditions:
   *   - Returns array (possibly empty) where ∀ a: a.companyId === companyId
   *   - Order is descending by a.createdAt
   */
  findByCompanyId(companyId: string): Promise<WhatsAppAgent[]> {
    return prisma.whatsAppAgent.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Finds a single agent by its primary key.
   *
   * Post-conditions:
   *   - Returns WhatsAppAgent if found, null otherwise
   *   - Does not throw for non-existent IDs
   */
  findById(id: string): Promise<WhatsAppAgent | null> {
    return prisma.whatsAppAgent.findUnique({ where: { id } });
  },

  /**
   * Creates a new WhatsAppAgent record.
   * Throws ConflictError if the (companyId, instanceName) pair already exists.
   *
   * Post-conditions:
   *   - Returned agent has a generated cuid id
   *   - agent.companyId === data.companyId
   *   - agent.status === "active" when not provided in data
   */
  create(data: CreateAgentData): Promise<WhatsAppAgent> {
    return handleUniqueConstraint(() =>
      prisma.whatsAppAgent.create({
        data: {
          companyId: data.companyId,
          name: data.name,
          description: data.description ?? null,
          instanceName: data.instanceName,
          evolutionApiUrl: data.evolutionApiUrl,
          evolutionApiKey: data.evolutionApiKey,
          systemPrompt: data.systemPrompt,
          delaySeconds: data.delaySeconds ?? 3,
          maxMessagesPerSession: data.maxMessagesPerSession ?? 50,
          status: data.status ?? "active",
        },
      }),
    );
  },

  /**
   * Updates fields of an existing agent identified by `id`.
   * Throws ConflictError if the updated (companyId, instanceName) pair collides
   * with another agent in the same company.
   *
   * Post-conditions:
   *   - agent.id === id (immutable)
   *   - agent.companyId is not altered
   */
  update(id: string, data: UpdateAgentData): Promise<WhatsAppAgent> {
    return handleUniqueConstraint(() =>
      prisma.whatsAppAgent.update({
        where: { id },
        data,
      }),
    );
  },

  /**
   * Deletes the agent and all associated WhatsAppMessage records (cascade is
   * handled by the database via `onDelete: Cascade` in the schema).
   *
   * Post-conditions:
   *   - Returns void on success
   *   - Throws Prisma P2025 (record not found) if the agent does not exist —
   *     callers should handle this or use findById first.
   */
  async delete(id: string): Promise<void> {
    await prisma.whatsAppAgent.delete({ where: { id } });
  },

  /**
   * Atomically toggles the agent's status between "active" and "paused".
   *
   * Post-conditions:
   *   - If agent was "active",  returned agent.status === "paused"
   *   - If agent was "paused",  returned agent.status === "active"
   *   - Operation is its own inverse (round-trip property)
   */
  async toggleStatus(id: string): Promise<WhatsAppAgent> {
    return prisma.$transaction(async (tx) => {
      const agent = await tx.whatsAppAgent.findUniqueOrThrow({ where: { id } });
      const nextStatus = agent.status === "active" ? "paused" : "active";
      return tx.whatsAppAgent.update({
        where: { id },
        data: { status: nextStatus },
      });
    });
  },
};

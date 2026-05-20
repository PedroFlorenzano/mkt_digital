/**
 * kbAgent.repository.ts
 *
 * Data access layer for the KBAgent model.
 * Surfaces Prisma P2002 (unique constraint violation) as ConflictError so the
 * service layer never has to inspect raw Prisma error codes.
 */

import { Prisma } from "@prisma/client";
import type { KBAgent } from "@prisma/client";
import { prisma } from "@server/lib/prisma";
import { ConflictError } from "@server/lib/errors";

// ─────────────────────────────────────────────
// Input types
// ─────────────────────────────────────────────

export interface CreateKBAgentInput {
  knowledgeBaseId: string;
  companyId: string;
  name: string;
  instanceName: string;
  evolutionApiUrl: string;
  evolutionApiKey: string;
  systemPrompt: string;
  delaySeconds?: number;
  maxMessagesPerDay?: number;
  /** Defaults to "active" when omitted. */
  status?: string;
}

export interface UpdateKBAgentInput {
  name?: string;
  evolutionApiUrl?: string;
  evolutionApiKey?: string;
  systemPrompt?: string;
  delaySeconds?: number;
  maxMessagesPerDay?: number;
  // instanceName is intentionally excluded — it is read-only after creation
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
        "A KB agent with the same instanceName already exists for this company.",
      );
    }
    throw err;
  }
}

// ─────────────────────────────────────────────
// Repository
// ─────────────────────────────────────────────

export const kbAgentRepository = {
  /**
   * Finds a single KB agent by its primary key.
   *
   * Post-conditions:
   *   - Returns KBAgent if found, null otherwise
   *   - Does not throw for non-existent IDs
   */
  findById(id: string): Promise<KBAgent | null> {
    return prisma.kBAgent.findUnique({ where: { id } });
  },

  /**
   * Finds the KB agent linked to a specific knowledge base.
   * Since `knowledgeBaseId` is unique in the schema, at most one agent exists
   * per knowledge base.
   *
   * Post-conditions:
   *   - Returns KBAgent if found, null otherwise
   */
  findByKnowledgeBaseId(knowledgeBaseId: string): Promise<KBAgent | null> {
    return prisma.kBAgent.findUnique({ where: { knowledgeBaseId } });
  },

  /**
   * Returns all KB agents belonging to `companyId`, ordered by creation date
   * (most recent first).
   *
   * Post-conditions:
   *   - Returns array (possibly empty) where ∀ a: a.companyId === companyId
   *   - Order is descending by a.createdAt
   */
  findByCompanyId(companyId: string): Promise<KBAgent[]> {
    return prisma.kBAgent.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Creates a new KBAgent record.
   * Throws ConflictError if the (companyId, instanceName) pair already exists.
   *
   * Post-conditions:
   *   - Returned agent has a generated cuid id
   *   - agent.companyId === data.companyId
   *   - agent.knowledgeBaseId === data.knowledgeBaseId
   *   - agent.status === "active" when not provided in data
   */
  create(data: CreateKBAgentInput): Promise<KBAgent> {
    return handleUniqueConstraint(() =>
      prisma.kBAgent.create({
        data: {
          knowledgeBaseId: data.knowledgeBaseId,
          companyId: data.companyId,
          name: data.name,
          instanceName: data.instanceName,
          evolutionApiUrl: data.evolutionApiUrl,
          evolutionApiKey: data.evolutionApiKey,
          systemPrompt: data.systemPrompt,
          delaySeconds: data.delaySeconds ?? 3,
          maxMessagesPerDay: data.maxMessagesPerDay ?? 50,
          status: data.status ?? "active",
        },
      }),
    );
  },

  /**
   * Updates allowed fields of an existing KB agent identified by `id`.
   * `instanceName` is intentionally excluded from updates (read-only after creation).
   *
   * Post-conditions:
   *   - agent.id === id (immutable)
   *   - agent.companyId is not altered
   *   - agent.instanceName is not altered
   */
  update(id: string, data: UpdateKBAgentInput): Promise<KBAgent> {
    return handleUniqueConstraint(() =>
      prisma.kBAgent.update({
        where: { id },
        data,
      }),
    );
  },

  /**
   * Atomically toggles the KB agent's status between "active" and "paused".
   *
   * Post-conditions:
   *   - If agent was "active",  returned agent.status === "paused"
   *   - If agent was "paused",  returned agent.status === "active"
   *   - Operation is its own inverse (round-trip property)
   */
  async toggleStatus(id: string): Promise<KBAgent> {
    return prisma.$transaction(async (tx) => {
      const agent = await tx.kBAgent.findUniqueOrThrow({ where: { id } });
      const nextStatus = agent.status === "active" ? "paused" : "active";
      return tx.kBAgent.update({
        where: { id },
        data: { status: nextStatus },
      });
    });
  },

  /**
   * Deletes the KB agent and all associated KBMessage records (cascade is
   * handled by the database via `onDelete: Cascade` in the schema).
   *
   * Post-conditions:
   *   - Returns void on success
   *   - Throws Prisma P2025 (record not found) if the agent does not exist —
   *     callers should handle this or use findById first.
   */
  async delete(id: string): Promise<void> {
    await prisma.kBAgent.delete({ where: { id } });
  },
};

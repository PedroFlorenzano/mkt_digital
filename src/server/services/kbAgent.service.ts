/**
 * kbAgent.service.ts
 *
 * Business-logic layer for KBAgent CRUD operations.
 *
 * Responsibilities:
 *   - Validate all field rules before any write
 *   - Assert KB/company ownership via knowledgeBaseService + companyService
 *   - Validate instanceName uniqueness across both WhatsAppAgent and KBAgent
 *   - Enforce one-agent-per-KB limit
 *   - Delegate persistence to kbAgentRepository
 *   - Surface typed errors (ValidationError, NotFoundError, ForbiddenError,
 *     ConflictError) so REST handlers never have to inspect raw Prisma errors
 */

import type { KBAgent } from "@prisma/client";
import { prisma } from "@server/lib/prisma";
import { kbAgentRepository } from "@server/repositories/kbAgent.repository";
import { knowledgeBaseRepository } from "@server/repositories/knowledgeBase.repository";
import { companyService } from "@server/services/company.service";
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from "@server/lib/errors";
import { logger } from "@server/lib/logger";

// ─────────────────────────────────────────────
// Public interfaces
// ─────────────────────────────────────────────

export interface CreateKBAgentInput {
  name: string;
  instanceName: string;
  evolutionApiUrl: string;
  evolutionApiKey: string;
  systemPrompt: string;
  /** Integer 1–60; defaults to 3 */
  delaySeconds?: number;
  /** Integer 1–500; defaults to 50 */
  maxMessagesPerDay?: number;
}

export interface UpdateKBAgentInput {
  name?: string;
  evolutionApiUrl?: string;
  evolutionApiKey?: string;
  systemPrompt?: string;
  delaySeconds?: number;
  maxMessagesPerDay?: number;
  // instanceName is intentionally excluded — read-only after creation
}

// ─────────────────────────────────────────────
// Validation constants
// ─────────────────────────────────────────────

const INSTANCE_NAME_REGEX = /^[a-zA-Z0-9-]+$/;

// ─────────────────────────────────────────────
// Internal validation helper
// ─────────────────────────────────────────────

/**
 * Validates fields present in the input object.
 * For creates, all required fields must be provided.
 * For updates, only the fields present in the input are validated.
 *
 * Throws ValidationError with a descriptive message on the first failing rule.
 */
function validate(
  input: CreateKBAgentInput | UpdateKBAgentInput,
  isCreate: boolean,
): void {
  // ── name ──────────────────────────────────────────────────────────────────
  if ("name" in input || isCreate) {
    const name = (input as CreateKBAgentInput).name;
    if (isCreate && (name === undefined || name === null)) {
      throw new ValidationError("O campo 'name' é obrigatório.");
    }
    if (name !== undefined && name !== null) {
      const trimmed = name.trim();
      if (trimmed.length < 1 || trimmed.length > 100) {
        throw new ValidationError(
          "O campo 'name' deve ter entre 1 e 100 caracteres.",
        );
      }
    }
  }

  // ── instanceName (create-only) ────────────────────────────────────────────
  if (isCreate) {
    const instanceName = (input as CreateKBAgentInput).instanceName;
    if (instanceName === undefined || instanceName === null) {
      throw new ValidationError("O campo 'instanceName' é obrigatório.");
    }
    const trimmed = instanceName.trim();
    if (trimmed.length < 1 || trimmed.length > 60) {
      throw new ValidationError(
        "O campo 'instanceName' deve ter entre 1 e 60 caracteres.",
      );
    }
    if (!INSTANCE_NAME_REGEX.test(trimmed)) {
      throw new ValidationError(
        "O campo 'instanceName' deve conter apenas letras, números e hífens.",
      );
    }
  }

  // ── evolutionApiUrl ───────────────────────────────────────────────────────
  if ("evolutionApiUrl" in input || isCreate) {
    const url = (input as CreateKBAgentInput).evolutionApiUrl;
    if (isCreate && (url === undefined || url === null)) {
      throw new ValidationError("O campo 'evolutionApiUrl' é obrigatório.");
    }
    if (url !== undefined && url !== null) {
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        throw new ValidationError(
          "O campo 'evolutionApiUrl' deve começar com 'http://' ou 'https://'.",
        );
      }
    }
  }

  // ── evolutionApiKey ───────────────────────────────────────────────────────
  if ("evolutionApiKey" in input || isCreate) {
    const apiKey = (input as CreateKBAgentInput).evolutionApiKey;
    if (isCreate && (apiKey === undefined || apiKey === null)) {
      throw new ValidationError("O campo 'evolutionApiKey' é obrigatório.");
    }
    if (apiKey !== undefined && apiKey !== null) {
      if (apiKey.trim().length < 1) {
        throw new ValidationError(
          "O campo 'evolutionApiKey' não pode ser vazio.",
        );
      }
    }
  }

  // ── systemPrompt ──────────────────────────────────────────────────────────
  if ("systemPrompt" in input || isCreate) {
    const prompt = (input as CreateKBAgentInput).systemPrompt;
    if (isCreate && (prompt === undefined || prompt === null)) {
      throw new ValidationError("O campo 'systemPrompt' é obrigatório.");
    }
    if (prompt !== undefined && prompt !== null) {
      if (prompt.length < 10 || prompt.length > 5000) {
        throw new ValidationError(
          "O campo 'systemPrompt' deve ter entre 10 e 5000 caracteres.",
        );
      }
    }
  }

  // ── delaySeconds ──────────────────────────────────────────────────────────
  if (input.delaySeconds !== undefined && input.delaySeconds !== null) {
    const ds = input.delaySeconds;
    if (!Number.isInteger(ds) || ds < 1 || ds > 60) {
      throw new ValidationError(
        "O campo 'delaySeconds' deve ser um inteiro entre 1 e 60.",
      );
    }
  }

  // ── maxMessagesPerDay ─────────────────────────────────────────────────────
  if (
    input.maxMessagesPerDay !== undefined &&
    input.maxMessagesPerDay !== null
  ) {
    const mmd = input.maxMessagesPerDay;
    if (!Number.isInteger(mmd) || mmd < 1 || mmd > 500) {
      throw new ValidationError(
        "O campo 'maxMessagesPerDay' deve ser um inteiro entre 1 e 500.",
      );
    }
  }
}

/**
 * Checks whether instanceName is already in use by any WhatsAppAgent or
 * KBAgent belonging to the given company.
 *
 * Throws ConflictError if a collision is found.
 */
async function assertInstanceNameUnique(
  companyId: string,
  instanceName: string,
  excludeKBAgentId?: string,
): Promise<void> {
  const [waCount, kbCount] = await Promise.all([
    prisma.whatsAppAgent.count({
      where: { companyId, instanceName },
    }),
    prisma.kBAgent.count({
      where: {
        companyId,
        instanceName,
        ...(excludeKBAgentId ? { NOT: { id: excludeKBAgentId } } : {}),
      },
    }),
  ]);

  if (waCount > 0 || kbCount > 0) {
    throw new ConflictError(
      "instanceName já está em uso por outro agente nesta empresa.",
    );
  }
}

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

export const kbAgentService = {
  /**
   * Returns the KBAgent linked to the given KnowledgeBase, or null if none
   * exists.
   *
   * Post-conditions:
   *   - Throws NotFoundError("KnowledgeBase") if knowledgeBaseId does not exist
   *   - Throws ForbiddenError if userId does not own the KB's company
   *   - Returns KBAgent | null
   */
  async getByKBId(
    userId: string,
    knowledgeBaseId: string,
  ): Promise<KBAgent | null> {
    // Assert KB ownership
    const kb = await knowledgeBaseRepository.findById(knowledgeBaseId);
    if (!kb) {
      throw new NotFoundError("KnowledgeBase");
    }
    await companyService.assertOwnership(userId, kb.companyId);

    return kbAgentRepository.findByKnowledgeBaseId(knowledgeBaseId);
  },

  /**
   * Creates a new KBAgent for the given KnowledgeBase after ownership
   * assertion, validation, and uniqueness checks.
   *
   * Post-conditions:
   *   - Throws NotFoundError("KnowledgeBase") if knowledgeBaseId does not exist
   *   - Throws ForbiddenError if userId does not own the KB's company
   *   - Throws ValidationError on any invalid field
   *   - Throws ConflictError if KB already has a KBAgent (one-per-KB limit)
   *   - Throws ConflictError if instanceName is already used by any agent in the company
   *   - Returned agent has status "active", delaySeconds 3, maxMessagesPerDay 50 by default
   *   - agent.companyId === kb.companyId
   *   - agent.knowledgeBaseId === knowledgeBaseId
   */
  async create(
    userId: string,
    knowledgeBaseId: string,
    input: CreateKBAgentInput,
  ): Promise<KBAgent> {
    // 1. Assert KB ownership
    const kb = await knowledgeBaseRepository.findById(knowledgeBaseId);
    if (!kb) {
      throw new NotFoundError("KnowledgeBase");
    }
    await companyService.assertOwnership(userId, kb.companyId);

    // 2. Validate all required fields
    validate(input, true);

    // 3. Check one-per-KB limit
    const existing = await kbAgentRepository.findByKnowledgeBaseId(knowledgeBaseId);
    if (existing) {
      throw new ConflictError(
        "Esta base de conhecimento já possui um agente vinculado. Apenas um agente é permitido por base de conhecimento.",
      );
    }

    // 4. Check instanceName uniqueness across WhatsAppAgent and KBAgent
    await assertInstanceNameUnique(kb.companyId, input.instanceName.trim());

    // 5. Persist
    const agent = await kbAgentRepository.create({
      knowledgeBaseId,
      companyId: kb.companyId,
      name: input.name.trim(),
      instanceName: input.instanceName.trim(),
      evolutionApiUrl: input.evolutionApiUrl,
      evolutionApiKey: input.evolutionApiKey,
      systemPrompt: input.systemPrompt,
      delaySeconds: input.delaySeconds ?? 3,
      maxMessagesPerDay: input.maxMessagesPerDay ?? 50,
      status: "active",
    });

    logger.info("[kbAgent.service] KBAgent created", {
      agentId: agent.id,
      knowledgeBaseId,
      companyId: kb.companyId,
      userId,
    });

    return agent;
  },

  /**
   * Updates an existing KBAgent after ownership assertion and validation.
   * `instanceName` is intentionally excluded from `UpdateKBAgentInput` and
   * must NOT be mutated after creation.
   *
   * Post-conditions:
   *   - Throws NotFoundError("KBAgent") if agentId does not exist
   *   - Throws ForbiddenError if userId does not own the agent's company
   *   - Throws ValidationError on any invalid updated field
   *   - agent.id, agent.companyId, and agent.instanceName are never mutated
   */
  async update(
    userId: string,
    agentId: string,
    input: UpdateKBAgentInput,
  ): Promise<KBAgent> {
    // 1. Assert existence and ownership
    await this.assertOwnership(userId, agentId);

    // 2. Validate only the provided fields
    validate(input, false);

    // 3. Build update payload — only include defined fields
    const data: UpdateKBAgentInput = {};

    if (input.name !== undefined) data.name = input.name.trim();
    if (input.evolutionApiUrl !== undefined)
      data.evolutionApiUrl = input.evolutionApiUrl;
    if (input.evolutionApiKey !== undefined)
      data.evolutionApiKey = input.evolutionApiKey;
    if (input.systemPrompt !== undefined) data.systemPrompt = input.systemPrompt;
    if (input.delaySeconds !== undefined) data.delaySeconds = input.delaySeconds;
    if (input.maxMessagesPerDay !== undefined)
      data.maxMessagesPerDay = input.maxMessagesPerDay;

    const updated = await kbAgentRepository.update(agentId, data);

    logger.info("[kbAgent.service] KBAgent updated", {
      agentId: updated.id,
      companyId: updated.companyId,
      userId,
    });

    return updated;
  },

  /**
   * Atomically toggles the KBAgent's status between "active" and "paused".
   *
   * Post-conditions:
   *   - Throws NotFoundError("KBAgent") if agentId does not exist
   *   - Throws ForbiddenError if userId does not own the agent's company
   *   - If was "active",  returned agent.status === "paused"
   *   - If was "paused",  returned agent.status === "active"
   */
  async toggleStatus(userId: string, agentId: string): Promise<KBAgent> {
    // Assert existence and ownership
    await this.assertOwnership(userId, agentId);

    const updated = await kbAgentRepository.toggleStatus(agentId);

    logger.info("[kbAgent.service] KBAgent status toggled", {
      agentId: updated.id,
      newStatus: updated.status,
      userId,
    });

    return updated;
  },

  /**
   * Deletes a KBAgent and all its associated KBMessages (cascade handled by DB).
   *
   * Post-conditions:
   *   - Throws NotFoundError("KBAgent") if agentId does not exist
   *   - Throws ForbiddenError if userId does not own the agent's company
   *   - Agent and all child KBMessage records are removed
   */
  async delete(userId: string, agentId: string): Promise<void> {
    const existing = await this.assertOwnership(userId, agentId);

    await kbAgentRepository.delete(existing.id);

    logger.info("[kbAgent.service] KBAgent deleted", {
      agentId: existing.id,
      companyId: existing.companyId,
      userId,
    });
  },

  /**
   * Retrieves a single KBAgent by its primary key without ownership checks.
   * Used by the webhook handler which does not have a user session.
   *
   * Post-conditions:
   *   - Returns KBAgent if found
   *   - Returns null if not found (callers decide whether to 404)
   */
  async getById(agentId: string): Promise<KBAgent | null> {
    return kbAgentRepository.findById(agentId);
  },

  /**
   * Verifies that `userId` owns the company that owns the KBAgent identified
   * by `agentId`. Uses opaque errors to prevent enumeration:
   *   - NotFoundError("KBAgent") if agentId does not exist
   *   - ForbiddenError if the agent's company is not owned by userId
   *
   * Post-conditions:
   *   - Returns KBAgent when ownership is confirmed
   */
  async assertOwnership(userId: string, agentId: string): Promise<KBAgent> {
    const agent = await kbAgentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError("KBAgent");
    }

    // Reuse companyService.assertOwnership which throws ForbiddenError
    // (opaque 403) when the company is not found or not owned by this user
    await companyService.assertOwnership(userId, agent.companyId);

    return agent;
  },
};

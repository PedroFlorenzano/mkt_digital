/**
 * agent.service.ts
 *
 * Business-logic layer for WhatsApp AI Agent CRUD operations.
 *
 * Responsibilities:
 *   - Validate all field rules before any write
 *   - Assert company ownership via companyService for every mutation
 *   - Delegate persistence to agentRepository
 *   - Surface typed errors (ValidationError, NotFoundError, ForbiddenError,
 *     ConflictError) so REST handlers never have to inspect raw Prisma errors
 */

import type { WhatsAppAgent } from "@prisma/client";
import { agentRepository } from "@server/repositories/agent.repository";
import { companyService } from "@server/services/company.service";
import { ValidationError, NotFoundError } from "@server/lib/errors";
import { logger } from "@server/lib/logger";

// ─────────────────────────────────────────────
// Public interfaces
// ─────────────────────────────────────────────

export interface CreateAgentInput {
  name: string;
  description?: string;
  instanceName: string;
  evolutionApiUrl: string;
  /** Stored as plain text; prepared for future encryption */
  evolutionApiKey: string;
  systemPrompt: string;
  /** Integer 1–60; defaults to 3 */
  delaySeconds?: number;
  /** Integer 1–500; defaults to 50 */
  maxMessagesPerSession?: number;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string | null;
  instanceName?: string;
  evolutionApiUrl?: string;
  evolutionApiKey?: string;
  systemPrompt?: string;
  delaySeconds?: number;
  maxMessagesPerSession?: number;
}

export interface AgentSummary {
  id: string;
  name: string;
  instanceName: string;
  status: "active" | "paused";
  createdAt: Date;
}

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
function validate(input: CreateAgentInput | UpdateAgentInput, isCreate: boolean): void {
  // ── name ──────────────────────────────────────────────────────────────────
  if ("name" in input || isCreate) {
    const name = (input as CreateAgentInput).name;
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

  // ── instanceName ──────────────────────────────────────────────────────────
  if ("instanceName" in input || isCreate) {
    const instanceName = (input as CreateAgentInput).instanceName;
    if (isCreate && (instanceName === undefined || instanceName === null)) {
      throw new ValidationError("O campo 'instanceName' é obrigatório.");
    }
    if (instanceName !== undefined && instanceName !== null) {
      if (instanceName.trim().length < 1) {
        throw new ValidationError(
          "O campo 'instanceName' não pode ser vazio.",
        );
      }
    }
  }

  // ── evolutionApiUrl ───────────────────────────────────────────────────────
  if ("evolutionApiUrl" in input || isCreate) {
    const url = (input as CreateAgentInput).evolutionApiUrl;
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
    const apiKey = (input as CreateAgentInput).evolutionApiKey;
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
    const prompt = (input as CreateAgentInput).systemPrompt;
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

  // ── maxMessagesPerSession ─────────────────────────────────────────────────
  if (
    input.maxMessagesPerSession !== undefined &&
    input.maxMessagesPerSession !== null
  ) {
    const mms = input.maxMessagesPerSession;
    if (!Number.isInteger(mms) || mms < 1 || mms > 500) {
      throw new ValidationError(
        "O campo 'maxMessagesPerSession' deve ser um inteiro entre 1 e 500.",
      );
    }
  }
}

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

export const agentService = {
  /**
   * Returns all agents belonging to `companyId`, ordered by creation date
   * (most recent first), projected to AgentSummary.
   *
   * Post-conditions:
   *   - Returns array (possibly empty)
   *   - ∀ a ∈ result: a.companyId === companyId (enforced by repository)
   */
  async listByCompanyId(companyId: string): Promise<AgentSummary[]> {
    const agents = await agentRepository.findByCompanyId(companyId);
    return agents.map((a) => ({
      id: a.id,
      name: a.name,
      instanceName: a.instanceName,
      status: a.status as "active" | "paused",
      createdAt: a.createdAt,
    }));
  },

  /**
   * Creates a new WhatsApp agent after ownership assertion and validation.
   *
   * Post-conditions:
   *   - Throws ForbiddenError if userId does not own companyId
   *   - Throws ValidationError on any invalid field
   *   - Throws ConflictError if instanceName is already in use within company
   *   - Returned agent has status "active", delaySeconds 3, maxMessagesPerSession 50 by default
   *   - agent.companyId === companyId
   */
  async createAgent(
    userId: string,
    companyId: string,
    input: CreateAgentInput,
  ): Promise<WhatsAppAgent> {
    // 1. Verify ownership
    await companyService.assertOwnership(userId, companyId);

    // 2. Validate input
    validate(input, true);

    // 3. Persist
    const agent = await agentRepository.create({
      companyId,
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      instanceName: input.instanceName.trim(),
      evolutionApiUrl: input.evolutionApiUrl,
      evolutionApiKey: input.evolutionApiKey,
      systemPrompt: input.systemPrompt,
      delaySeconds: input.delaySeconds ?? 3,
      maxMessagesPerSession: input.maxMessagesPerSession ?? 50,
      status: "active",
    });

    logger.info("[agent.service] Agent created", {
      agentId: agent.id,
      companyId,
      userId,
    });

    return agent;
  },

  /**
   * Updates an existing agent after ownership assertion and validation.
   *
   * Post-conditions:
   *   - Throws ForbiddenError if userId does not own the agent's company
   *   - Throws NotFoundError if agentId does not exist
   *   - Throws ValidationError on any invalid updated field
   *   - Throws ConflictError if updated instanceName collides with another agent
   *   - agent.id and agent.companyId are never mutated
   */
  async updateAgent(
    userId: string,
    agentId: string,
    input: UpdateAgentInput,
  ): Promise<WhatsAppAgent> {
    // 1. Assert existence and ownership
    const existing = await this.assertOwnership(userId, agentId);

    // 2. Validate only the provided fields
    validate(input, false);

    // 3. Build update payload — only include defined fields
    const data: Parameters<typeof agentRepository.update>[1] = {};

    if (input.name !== undefined) data.name = input.name.trim();
    if (input.description !== undefined) data.description = input.description?.trim() ?? null;
    if (input.instanceName !== undefined) data.instanceName = input.instanceName.trim();
    if (input.evolutionApiUrl !== undefined) data.evolutionApiUrl = input.evolutionApiUrl;
    if (input.evolutionApiKey !== undefined) data.evolutionApiKey = input.evolutionApiKey;
    if (input.systemPrompt !== undefined) data.systemPrompt = input.systemPrompt;
    if (input.delaySeconds !== undefined) data.delaySeconds = input.delaySeconds;
    if (input.maxMessagesPerSession !== undefined)
      data.maxMessagesPerSession = input.maxMessagesPerSession;

    const updated = await agentRepository.update(existing.id, data);

    logger.info("[agent.service] Agent updated", {
      agentId: updated.id,
      companyId: updated.companyId,
      userId,
    });

    return updated;
  },

  /**
   * Atomically toggles the agent's status between "active" and "paused".
   *
   * Post-conditions:
   *   - Throws ForbiddenError if userId does not own the agent's company
   *   - Throws NotFoundError if agentId does not exist
   *   - If was "active",  returned agent.status === "paused"
   *   - If was "paused",  returned agent.status === "active"
   */
  async toggleStatus(userId: string, agentId: string): Promise<WhatsAppAgent> {
    // Assert existence and ownership
    await this.assertOwnership(userId, agentId);

    const updated = await agentRepository.toggleStatus(agentId);

    logger.info("[agent.service] Agent status toggled", {
      agentId: updated.id,
      newStatus: updated.status,
      userId,
    });

    return updated;
  },

  /**
   * Deletes an agent and all its associated messages (cascade handled by DB).
   *
   * Post-conditions:
   *   - Throws ForbiddenError if userId does not own the agent's company
   *   - Throws NotFoundError if agentId does not exist
   *   - Agent and all child WhatsAppMessage records are removed
   */
  async deleteAgent(userId: string, agentId: string): Promise<void> {
    const existing = await this.assertOwnership(userId, agentId);

    await agentRepository.delete(existing.id);

    logger.info("[agent.service] Agent deleted", {
      agentId: existing.id,
      companyId: existing.companyId,
      userId,
    });
  },

  /**
   * Retrieves a single agent by its primary key without ownership checks.
   * Used by the webhook handler which does not have a user session.
   *
   * Post-conditions:
   *   - Returns WhatsAppAgent if found
   *   - Returns null if not found (callers decide whether to 404)
   */
  async getById(agentId: string): Promise<WhatsAppAgent | null> {
    return agentRepository.findById(agentId);
  },

  /**
   * Verifies that `userId` owns the company that owns the agent identified
   * by `agentId`. Throws opaque errors to prevent enumeration:
   *   - NotFoundError if agentId does not exist
   *   - ForbiddenError if the agent's company is not owned by userId
   *
   * Post-conditions:
   *   - Returns WhatsAppAgent when ownership is confirmed
   */
  async assertOwnership(userId: string, agentId: string): Promise<WhatsAppAgent> {
    const agent = await agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError("WhatsAppAgent");
    }

    // Reuse companyService.assertOwnership which throws ForbiddenError
    // (opaque 403) when the company is not found or not owned by this user
    await companyService.assertOwnership(userId, agent.companyId);

    return agent;
  },
};

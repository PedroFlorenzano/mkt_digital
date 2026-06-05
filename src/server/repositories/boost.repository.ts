import { prisma } from "@server/lib/prisma";

export const boostRepository = {
  createAuditLog(data: {
    companyId: string;
    actionType: string;
    source: string;
    userDecision?: string | null;
    userDecisionAt?: Date | null;
    requiresConfirmation: boolean;
    metadata?: string | null;
  }) {
    return prisma.campaignAuditLog.create({ data });
  },

  updateAuditLogCampaignId(auditLogId: string, campaignId: string) {
    return prisma.campaignAuditLog.update({
      where: { id: auditLogId },
      data: { campaignId },
    });
  },

  createAdCampaign(data: {
    companyId: string;
    credentialId: string;
    platform: string;
    campaignType: string;
    name: string;
    objective: string;
    dailyBudgetBrl: number;
    status: string;
    sourcePostId: string;
    boostConfirmedAt: Date;
    aiDraftJson: string;
  }) {
    return prisma.adCampaign.create({ data });
  },
};

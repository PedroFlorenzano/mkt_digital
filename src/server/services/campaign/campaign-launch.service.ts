/**
 * campaign-launch.service.ts
 * Platform integration & campaign creation.
 */

import { prisma } from "@server/lib/prisma";
import { ExternalServiceError, NotFoundError, ValidationError } from "@server/lib/errors";
import { logger } from "@server/lib/logger";
import { credentialService, type AdPlatform } from "@server/services/credential.service";
import { metaAdsConnector } from "@server/lib/meta-ads.connector";
import { googleAdsConnector } from "@server/lib/google-ads.connector";
import type { AdCampaign } from "@prisma/client";
import type { CampaignDraft } from "./campaign.types";

export async function launchCampaign(
  companyId: string,
  draft: CampaignDraft,
  platforms: AdPlatform[],
): Promise<AdCampaign[]> {
  const createdCampaigns: AdCampaign[] = [];

  for (const platform of platforms) {
    let creds: Awaited<ReturnType<typeof credentialService.get>>;
    try {
      creds = await credentialService.get(companyId, platform);
    } catch (err) {
      if (err instanceof NotFoundError) throw new ValidationError(`Plataforma ${platform} não tem credenciais cadastradas.`);
      throw err;
    }

    let externalCampaignId: string;
    let externalAdSetId: string | undefined;
    let externalAdIds: string[];
    let managerUrl: string;
    let campaignType: string;

    if (platform === "meta") {
      campaignType = "social";
      const result = await metaAdsConnector.createCampaign(creds, draft);
      externalCampaignId = result.externalCampaignId;
      externalAdSetId = result.externalAdSetId;
      externalAdIds = result.externalAdIds;
      managerUrl = result.managerUrl;
    } else {
      const hasKeywords = Array.isArray(draft.keywords) && draft.keywords.length > 0;
      if (hasKeywords) {
        campaignType = "search";
        const result = await googleAdsConnector.createSearchCampaign(creds, draft);
        externalCampaignId = result.externalCampaignId;
        externalAdSetId = result.externalAdGroupId;
        externalAdIds = result.externalAdIds;
        managerUrl = result.managerUrl;
      } else {
        campaignType = "display";
        const result = await googleAdsConnector.createDisplayCampaign(creds, draft);
        externalCampaignId = result.externalCampaignId;
        externalAdSetId = result.externalAdGroupId;
        externalAdIds = result.externalAdIds;
        managerUrl = result.managerUrl;
      }
    }

    const credentialRecord = await prisma.adPlatformCredential.findUnique({
      where: { companyId_platform: { companyId, platform } },
      select: { id: true },
    });
    if (!credentialRecord) throw new ValidationError(`Plataforma ${platform} não tem credenciais cadastradas.`);

    let campaign: AdCampaign;
    try {
      campaign = await prisma.adCampaign.create({
        data: {
          companyId, credentialId: credentialRecord.id, platform, campaignType,
          name: draft.objective.slice(0, 255), objective: draft.objective,
          dailyBudgetBrl: draft.dailyBudgetBrl, status: "active",
          externalCampaignId, externalAdSetId: externalAdSetId ?? null,
          externalAdIds: JSON.stringify(externalAdIds), managerUrl,
          aiDraftJson: JSON.stringify(draft), launchedAt: new Date(),
        },
      });
    } catch (dbErr) {
      logger.error("[campaign] DB save failed after platform creation", dbErr, { companyId, platform, externalCampaignId });
      try {
        campaign = await prisma.adCampaign.create({
          data: {
            companyId, credentialId: credentialRecord.id, platform, campaignType,
            name: draft.objective.slice(0, 255), objective: draft.objective,
            dailyBudgetBrl: draft.dailyBudgetBrl, status: "error",
            externalCampaignId, externalAdSetId: externalAdSetId ?? null,
            externalAdIds: JSON.stringify(externalAdIds), managerUrl,
            aiDraftJson: JSON.stringify(draft), launchedAt: new Date(),
          },
        });
      } catch {
        throw new ExternalServiceError(platform === "meta" ? "Meta Ads" : "Google Ads", `Campanha criada na plataforma mas falhou ao salvar no banco`);
      }
      createdCampaigns.push(campaign);
      continue;
    }

    try {
      await prisma.campaignAuditLog.create({
        data: { companyId, campaignId: campaign.id, actionType: "campaign_created", source: "user", newValues: JSON.stringify({ externalCampaignId, externalAdSetId, externalAdIds, managerUrl, platform, campaignType }) },
      });
    } catch (auditErr) {
      logger.error("[campaign] Failed to write audit log", auditErr, { campaignId: campaign.id });
    }

    logger.info("[campaign] Campaign launched", { companyId, platform, campaignId: campaign.id, externalCampaignId });
    createdCampaigns.push(campaign);
  }

  return createdCampaigns;
}

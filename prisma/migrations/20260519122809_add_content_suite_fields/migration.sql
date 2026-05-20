-- AlterTable
ALTER TABLE "AdCampaign" ADD COLUMN "boostConfirmedAt" DATETIME;
ALTER TABLE "AdCampaign" ADD COLUMN "sourcePostId" TEXT;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN "boostCampaignId" TEXT;
ALTER TABLE "Post" ADD COLUMN "boostSuggestionJson" TEXT;
ALTER TABLE "Post" ADD COLUMN "format" TEXT DEFAULT 'post';
ALTER TABLE "Post" ADD COLUMN "gridOrder" INTEGER;
ALTER TABLE "Post" ADD COLUMN "slidesJson" TEXT;

-- CreateIndex
CREATE INDEX "AdCampaign_sourcePostId_idx" ON "AdCampaign"("sourcePostId");

-- CreateIndex
CREATE INDEX "Post_companyId_format_idx" ON "Post"("companyId", "format");

-- CreateIndex
CREATE INDEX "Post_companyId_platform_status_idx" ON "Post"("companyId", "platform", "status");

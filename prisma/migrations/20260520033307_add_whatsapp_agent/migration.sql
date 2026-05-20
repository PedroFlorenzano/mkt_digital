-- CreateTable
CREATE TABLE "WhatsAppAgent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "instanceName" TEXT NOT NULL,
    "evolutionApiUrl" TEXT NOT NULL,
    "evolutionApiKey" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "delaySeconds" INTEGER NOT NULL DEFAULT 3,
    "maxMessagesPerSession" INTEGER NOT NULL DEFAULT 50,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WhatsAppAgent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "remoteJid" TEXT NOT NULL,
    "contactName" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WhatsAppMessage_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "WhatsAppAgent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "WhatsAppAgent_companyId_idx" ON "WhatsAppAgent"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppAgent_companyId_instanceName_key" ON "WhatsAppAgent"("companyId", "instanceName");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_agentId_idx" ON "WhatsAppMessage"("agentId");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_agentId_remoteJid_idx" ON "WhatsAppMessage"("agentId", "remoteJid");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_agentId_remoteJid_createdAt_idx" ON "WhatsAppMessage"("agentId", "remoteJid", "createdAt");

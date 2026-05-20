-- CreateTable
CREATE TABLE "KnowledgeBase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "catalogType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KnowledgeBase_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CatalogField" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "knowledgeBaseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "isFilterable" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CatalogField_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CatalogRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "knowledgeBaseId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CatalogRecord_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KBAgent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "knowledgeBaseId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL,
    "evolutionApiUrl" TEXT NOT NULL,
    "evolutionApiKey" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "delaySeconds" INTEGER NOT NULL DEFAULT 3,
    "maxMessagesPerDay" INTEGER NOT NULL DEFAULT 50,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KBAgent_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KBAgent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KBMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "remoteJid" TEXT NOT NULL,
    "contactName" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KBMessage_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "KBAgent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "KnowledgeBase_companyId_idx" ON "KnowledgeBase"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogField_knowledgeBaseId_name_key" ON "CatalogField"("knowledgeBaseId", "name");

-- CreateIndex
CREATE INDEX "CatalogRecord_knowledgeBaseId_idx" ON "CatalogRecord"("knowledgeBaseId");

-- CreateIndex
CREATE UNIQUE INDEX "KBAgent_knowledgeBaseId_key" ON "KBAgent"("knowledgeBaseId");

-- CreateIndex
CREATE INDEX "KBAgent_companyId_idx" ON "KBAgent"("companyId");

-- CreateIndex
CREATE INDEX "KBAgent_knowledgeBaseId_idx" ON "KBAgent"("knowledgeBaseId");

-- CreateIndex
CREATE UNIQUE INDEX "KBAgent_companyId_instanceName_key" ON "KBAgent"("companyId", "instanceName");

-- CreateIndex
CREATE INDEX "KBMessage_agentId_idx" ON "KBMessage"("agentId");

-- CreateIndex
CREATE INDEX "KBMessage_agentId_remoteJid_idx" ON "KBMessage"("agentId", "remoteJid");

-- CreateIndex
CREATE INDEX "KBMessage_agentId_remoteJid_createdAt_idx" ON "KBMessage"("agentId", "remoteJid", "createdAt");

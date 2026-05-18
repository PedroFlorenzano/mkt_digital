-- DropIndex
DROP INDEX "Company_userId_key";

-- CreateIndex
CREATE INDEX "Company_userId_idx" ON "Company"("userId");

-- DropIndex
DROP INDEX "Schedule_providerId_idx";

-- CreateIndex
CREATE INDEX "Schedule_providerId_status_idx" ON "Schedule"("providerId", "status");

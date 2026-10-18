-- CreateTable
CREATE TABLE "PlanRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "quoteJson" TEXT NOT NULL,
    "contextJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reserveBreached" BOOLEAN NOT NULL,
    "saveCheckJson" TEXT NOT NULL,
    "saveAcknowledgementJson" TEXT,
    "completionCheckJson" TEXT,
    "completionAcknowledgementJson" TEXT,
    "completionJson" TEXT,
    "completionActivityId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "cancelledAt" DATETIME,
    CONSTRAINT "PlanRecord_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlanRecord_completionActivityId_fkey" FOREIGN KEY ("completionActivityId") REFERENCES "Activity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlanRecord_status_check" CHECK ("status" IN ('pending', 'completed', 'cancelled'))
);

-- CreateTable
CREATE TABLE "WorkflowRequest" (
    "operation" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("operation", "idempotencyKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanRecord_completionActivityId_key" ON "PlanRecord"("completionActivityId");

-- CreateIndex
CREATE INDEX "PlanRecord_profileId_status_createdAt_id_idx" ON "PlanRecord"("profileId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "PlanRecord_profileId_createdAt_id_idx" ON "PlanRecord"("profileId", "createdAt", "id");

-- Prisma cannot express these workflow audit guards in its schema DSL.
CREATE TRIGGER "PlanRecord_snapshot_immutable"
BEFORE UPDATE OF "quoteJson", "contextJson", "profileId" ON "PlanRecord"
WHEN NEW."quoteJson" <> OLD."quoteJson" OR NEW."contextJson" <> OLD."contextJson" OR NEW."profileId" <> OLD."profileId"
BEGIN
  SELECT RAISE(ABORT, 'Plan quote and routing snapshots are immutable');
END;

CREATE TRIGGER "PlanRecord_terminal_status"
BEFORE UPDATE OF "status" ON "PlanRecord"
WHEN OLD."status" IN ('completed', 'cancelled') AND NEW."status" <> OLD."status"
BEGIN
  SELECT RAISE(ABORT, 'Completed and cancelled plans cannot change status');
END;

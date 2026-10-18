-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "decisionJson" TEXT NOT NULL DEFAULT '{}',
    "activeProposalId" TEXT,
    "processingTurnId" TEXT,
    "leaseExpiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentSession_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentTurn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "requestJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "leaseOwner" TEXT NOT NULL,
    "responseJson" TEXT,
    "httpStatus" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "AgentTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AgentTurn_status_check" CHECK ("status" IN ('processing', 'completed'))
);

-- CreateTable
CREATE TABLE "AgentMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "responseJson" TEXT,
    "referencesJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AgentMessage_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "AgentTurn" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AgentMessage_role_check" CHECK ("role" IN ('user', 'assistant'))
);

-- CreateTable
CREATE TABLE "AgentQuoteSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "selectionJson" TEXT NOT NULL,
    "assumptionsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentQuoteSnapshot_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "previewJson" TEXT NOT NULL,
    "contextToken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentProposal_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AgentProposal_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "AgentQuoteSnapshot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentProposalPreview" (
    "proposalId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("proposalId", "token"),
    CONSTRAINT "AgentProposalPreview_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "AgentProposal" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentToolExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "turnId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "argsJson" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "summaryJson" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentToolExecution_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "AgentTurn" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentTurn_sessionId_idempotencyKey_key" ON "AgentTurn"("sessionId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentMessage_sessionId_id_idx" ON "AgentMessage"("sessionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AgentMessage_turnId_role_key" ON "AgentMessage"("turnId", "role");

-- CreateIndex
CREATE INDEX "AgentQuoteSnapshot_sessionId_quoteId_idx" ON "AgentQuoteSnapshot"("sessionId", "quoteId");

-- CreateIndex
CREATE INDEX "AgentProposal_sessionId_snapshotId_contextToken_idx" ON "AgentProposal"("sessionId", "snapshotId", "contextToken");

CREATE TRIGGER "AgentQuoteSnapshot_immutable"
BEFORE UPDATE ON "AgentQuoteSnapshot"
BEGIN
  SELECT RAISE(ABORT, 'Agent quote snapshots are immutable');
END;

CREATE TRIGGER "AgentProposal_immutable"
BEFORE UPDATE ON "AgentProposal"
BEGIN
  SELECT RAISE(ABORT, 'Agent proposal snapshots are immutable');
END;

CREATE TRIGGER "AgentProposal_snapshot_scope"
BEFORE INSERT ON "AgentProposal"
WHEN NOT EXISTS (SELECT 1 FROM "AgentQuoteSnapshot" WHERE "id" = NEW."snapshotId" AND "sessionId" = NEW."sessionId")
BEGIN
  SELECT RAISE(ABORT, 'Agent quote and proposal must belong to the same session');
END;

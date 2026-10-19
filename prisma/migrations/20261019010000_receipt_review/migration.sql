-- Additive workflow metadata only; no existing financial tables are rebuilt.
CREATE TABLE "ReceiptAttachment" (
  "id" TEXT NOT NULL PRIMARY KEY, "sessionId" TEXT NOT NULL, "storageKey" TEXT NOT NULL,
  "sha256" TEXT NOT NULL, "contentType" TEXT NOT NULL, "byteSize" INTEGER NOT NULL,
  "width" INTEGER NOT NULL, "height" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" DATETIME NOT NULL, "purgedAt" DATETIME,
  FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK ("byteSize" BETWEEN 1 AND 4194304 AND "width" BETWEEN 1 AND 4096 AND "height" BETWEEN 1 AND 4096)
);
CREATE UNIQUE INDEX "ReceiptAttachment_storageKey_key" ON "ReceiptAttachment"("storageKey");
CREATE INDEX "ReceiptAttachment_sessionId_createdAt_idx" ON "ReceiptAttachment"("sessionId", "createdAt");
CREATE TABLE "ReceiptDraft" (
  "id" TEXT NOT NULL PRIMARY KEY, "sessionId" TEXT NOT NULL, "attachmentId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL, "extractedJson" TEXT NOT NULL, "currentVersion" INTEGER NOT NULL DEFAULT 1,
  "confirmedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("attachmentId") REFERENCES "ReceiptAttachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK ("currentVersion" > 0)
);
CREATE UNIQUE INDEX "ReceiptDraft_attachmentId_key" ON "ReceiptDraft"("attachmentId");
CREATE INDEX "ReceiptDraft_sessionId_createdAt_idx" ON "ReceiptDraft"("sessionId", "createdAt");
CREATE TABLE "ReceiptDraftVersion" (
  "draftId" TEXT NOT NULL, "version" INTEGER NOT NULL, "receiptJson" TEXT NOT NULL,
  "correctionsBadgeJson" TEXT, "assignmentsJson" TEXT, "origin" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("draftId", "version"),
  FOREIGN KEY ("draftId") REFERENCES "ReceiptDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK ("version" > 0)
);
CREATE TABLE "ReceiptSplitProposal" (
  "id" TEXT NOT NULL PRIMARY KEY, "draftId" TEXT NOT NULL, "version" INTEGER NOT NULL,
  "bindingHash" TEXT NOT NULL, "allocationJson" TEXT NOT NULL, "postingInputJson" TEXT NOT NULL,
  "resultJson" TEXT, "confirmedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("draftId") REFERENCES "ReceiptDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ReceiptSplitProposal_draftId_version_idx" ON "ReceiptSplitProposal"("draftId", "version");
CREATE INDEX "ReceiptSplitProposal_confirmedAt_id_idx" ON "ReceiptSplitProposal"("confirmedAt", "id");
CREATE TABLE "ReceiptConfirmationRequest" (
  "sessionId" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "payloadHash" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL, "resultJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("sessionId", "idempotencyKey"),
  FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("proposalId") REFERENCES "ReceiptSplitProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TRIGGER "ReceiptDraft_extraction_immutable" BEFORE UPDATE OF "extractedJson", "receiptId", "attachmentId", "sessionId" ON "ReceiptDraft"
BEGIN SELECT RAISE(ABORT, 'Original extraction and receipt ownership are immutable'); END;
CREATE TRIGGER "ReceiptVersion_immutable" BEFORE UPDATE ON "ReceiptDraftVersion"
BEGIN SELECT RAISE(ABORT, 'Receipt versions are append only'); END;
CREATE TRIGGER "ReceiptProposal_binding_immutable" BEFORE UPDATE OF "draftId", "version", "bindingHash", "allocationJson", "postingInputJson" ON "ReceiptSplitProposal"
BEGIN SELECT RAISE(ABORT, 'Trusted receipt proposal binding is immutable'); END;

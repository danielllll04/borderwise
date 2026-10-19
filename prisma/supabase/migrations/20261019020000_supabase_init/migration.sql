BEGIN;
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "borderwise";

-- CreateTable
CREATE TABLE "borderwise"."Profile" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "homeCurrency" TEXT NOT NULL DEFAULT 'MYR',
    "destinationCurrency" TEXT NOT NULL DEFAULT 'KRW',
    "fixedReserveMinor" BIGINT NOT NULL,
    "emergencyReserveMinor" BIGINT NOT NULL,
    "fixedReserveBadgeJson" TEXT NOT NULL,
    "emergencyBadgeJson" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borderwise"."Account" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "balanceMinor" BIGINT NOT NULL DEFAULT 0,
    "balanceBadgeJson" TEXT NOT NULL,
    "balanceProvenanceJson" TEXT NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borderwise"."Activity" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "inputJson" TEXT NOT NULL,
    "inputProvenanceJson" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borderwise"."LedgerEntry" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "badgeJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borderwise"."LedgerLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,

    CONSTRAINT "LedgerLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borderwise"."Receivable" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "debtor" TEXT NOT NULL,
    "originalAmountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "amountBadgeJson" TEXT NOT NULL,
    "settledMinor" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "Receivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borderwise"."SharedExpense" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "splitId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "ledgerEntryId" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "paidFromAccount" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "billTotalMinor" BIGINT NOT NULL,
    "payerShareMinor" BIGINT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borderwise"."SharedExpenseAllocation" (
    "id" TEXT NOT NULL,
    "sharedExpenseId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "shareMinor" BIGINT NOT NULL,
    "receivableId" TEXT NOT NULL,

    CONSTRAINT "SharedExpenseAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borderwise"."Settlement" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "clearingMinor" BIGINT NOT NULL,
    "clearingCurrency" TEXT NOT NULL,
    "receivedMinor" BIGINT NOT NULL,
    "receivedCurrency" TEXT NOT NULL,
    "receivingAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borderwise"."PlanRecord" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "PlanRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borderwise"."WorkflowRequest" (
    "operation" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowRequest_pkey" PRIMARY KEY ("operation","idempotencyKey")
);

-- CreateTable
CREATE TABLE "borderwise"."AgentSession" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "decisionJson" TEXT NOT NULL DEFAULT '{}',
    "activeProposalId" TEXT,
    "processingTurnId" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borderwise"."ReceiptAttachment" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "purgedAt" TIMESTAMP(3),

    CONSTRAINT "ReceiptAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borderwise"."ReceiptDraft" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "extractedJson" TEXT NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceiptDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borderwise"."ReceiptDraftVersion" (
    "draftId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "receiptJson" TEXT NOT NULL,
    "correctionsBadgeJson" TEXT,
    "assignmentsJson" TEXT,
    "origin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptDraftVersion_pkey" PRIMARY KEY ("draftId","version")
);

-- CreateTable
CREATE TABLE "borderwise"."ReceiptSplitProposal" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "bindingHash" TEXT NOT NULL,
    "allocationJson" TEXT NOT NULL,
    "postingInputJson" TEXT NOT NULL,
    "resultJson" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptSplitProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borderwise"."ReceiptConfirmationRequest" (
    "sessionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptConfirmationRequest_pkey" PRIMARY KEY ("sessionId","idempotencyKey")
);

-- CreateTable
CREATE TABLE "borderwise"."AgentTurn" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "requestJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "leaseOwner" TEXT NOT NULL,
    "responseJson" TEXT,
    "httpStatus" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AgentTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borderwise"."AgentMessage" (
    "id" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "responseJson" TEXT,
    "referencesJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borderwise"."AgentQuoteSnapshot" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "selectionJson" TEXT NOT NULL,
    "assumptionsJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentQuoteSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borderwise"."AgentProposal" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "previewJson" TEXT NOT NULL,
    "contextToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borderwise"."AgentProposalPreview" (
    "proposalId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentProposalPreview_pkey" PRIMARY KEY ("proposalId","token")
);

-- CreateTable
CREATE TABLE "borderwise"."AgentToolExecution" (
    "id" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "argsJson" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "summaryJson" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentToolExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Activity_idempotencyKey_key" ON "borderwise"."Activity"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LedgerEntry_profileId_createdAt_id_idx" ON "borderwise"."LedgerEntry"("profileId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "LedgerEntry_activityId_idx" ON "borderwise"."LedgerEntry"("activityId");

-- CreateIndex
CREATE INDEX "LedgerLine_entryId_idx" ON "borderwise"."LedgerLine"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedExpense_activityId_key" ON "borderwise"."SharedExpense"("activityId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedExpense_ledgerEntryId_key" ON "borderwise"."SharedExpense"("ledgerEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedExpense_profileId_splitId_key" ON "borderwise"."SharedExpense"("profileId", "splitId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedExpense_profileId_receiptId_key" ON "borderwise"."SharedExpense"("profileId", "receiptId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedExpenseAllocation_receivableId_key" ON "borderwise"."SharedExpenseAllocation"("receivableId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedExpenseAllocation_sharedExpenseId_participantId_key" ON "borderwise"."SharedExpenseAllocation"("sharedExpenseId", "participantId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_activityId_key" ON "borderwise"."Settlement"("activityId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanRecord_completionActivityId_key" ON "borderwise"."PlanRecord"("completionActivityId");

-- CreateIndex
CREATE INDEX "PlanRecord_profileId_status_createdAt_id_idx" ON "borderwise"."PlanRecord"("profileId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "PlanRecord_profileId_createdAt_id_idx" ON "borderwise"."PlanRecord"("profileId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptAttachment_storageKey_key" ON "borderwise"."ReceiptAttachment"("storageKey");

-- CreateIndex
CREATE INDEX "ReceiptAttachment_sessionId_createdAt_idx" ON "borderwise"."ReceiptAttachment"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptDraft_attachmentId_key" ON "borderwise"."ReceiptDraft"("attachmentId");

-- CreateIndex
CREATE INDEX "ReceiptDraft_sessionId_createdAt_idx" ON "borderwise"."ReceiptDraft"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ReceiptSplitProposal_draftId_version_idx" ON "borderwise"."ReceiptSplitProposal"("draftId", "version");

-- CreateIndex
CREATE INDEX "ReceiptSplitProposal_confirmedAt_id_idx" ON "borderwise"."ReceiptSplitProposal"("confirmedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTurn_sessionId_idempotencyKey_key" ON "borderwise"."AgentTurn"("sessionId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentMessage_sessionId_id_idx" ON "borderwise"."AgentMessage"("sessionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AgentMessage_turnId_role_key" ON "borderwise"."AgentMessage"("turnId", "role");

-- CreateIndex
CREATE INDEX "AgentQuoteSnapshot_sessionId_quoteId_idx" ON "borderwise"."AgentQuoteSnapshot"("sessionId", "quoteId");

-- CreateIndex
CREATE INDEX "AgentProposal_sessionId_snapshotId_contextToken_idx" ON "borderwise"."AgentProposal"("sessionId", "snapshotId", "contextToken");

-- AddForeignKey
ALTER TABLE "borderwise"."Account" ADD CONSTRAINT "Account_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "borderwise"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."Activity" ADD CONSTRAINT "Activity_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "borderwise"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."LedgerEntry" ADD CONSTRAINT "LedgerEntry_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "borderwise"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."LedgerEntry" ADD CONSTRAINT "LedgerEntry_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "borderwise"."Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."LedgerLine" ADD CONSTRAINT "LedgerLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "borderwise"."LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."LedgerLine" ADD CONSTRAINT "LedgerLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "borderwise"."Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."Receivable" ADD CONSTRAINT "Receivable_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "borderwise"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."SharedExpense" ADD CONSTRAINT "SharedExpense_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "borderwise"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."SharedExpense" ADD CONSTRAINT "SharedExpense_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "borderwise"."Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."SharedExpense" ADD CONSTRAINT "SharedExpense_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "borderwise"."LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."SharedExpense" ADD CONSTRAINT "SharedExpense_paidFromAccount_fkey" FOREIGN KEY ("paidFromAccount") REFERENCES "borderwise"."Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."SharedExpenseAllocation" ADD CONSTRAINT "SharedExpenseAllocation_sharedExpenseId_fkey" FOREIGN KEY ("sharedExpenseId") REFERENCES "borderwise"."SharedExpense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."SharedExpenseAllocation" ADD CONSTRAINT "SharedExpenseAllocation_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "borderwise"."Receivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."Settlement" ADD CONSTRAINT "Settlement_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "borderwise"."Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."Settlement" ADD CONSTRAINT "Settlement_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "borderwise"."Receivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."PlanRecord" ADD CONSTRAINT "PlanRecord_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "borderwise"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."PlanRecord" ADD CONSTRAINT "PlanRecord_completionActivityId_fkey" FOREIGN KEY ("completionActivityId") REFERENCES "borderwise"."Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."AgentSession" ADD CONSTRAINT "AgentSession_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "borderwise"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."ReceiptAttachment" ADD CONSTRAINT "ReceiptAttachment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "borderwise"."AgentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."ReceiptDraft" ADD CONSTRAINT "ReceiptDraft_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "borderwise"."AgentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."ReceiptDraft" ADD CONSTRAINT "ReceiptDraft_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "borderwise"."ReceiptAttachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."ReceiptDraftVersion" ADD CONSTRAINT "ReceiptDraftVersion_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "borderwise"."ReceiptDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."ReceiptSplitProposal" ADD CONSTRAINT "ReceiptSplitProposal_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "borderwise"."ReceiptDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."ReceiptConfirmationRequest" ADD CONSTRAINT "ReceiptConfirmationRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "borderwise"."AgentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."ReceiptConfirmationRequest" ADD CONSTRAINT "ReceiptConfirmationRequest_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "borderwise"."ReceiptSplitProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."AgentTurn" ADD CONSTRAINT "AgentTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "borderwise"."AgentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."AgentMessage" ADD CONSTRAINT "AgentMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "borderwise"."AgentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."AgentMessage" ADD CONSTRAINT "AgentMessage_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "borderwise"."AgentTurn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."AgentQuoteSnapshot" ADD CONSTRAINT "AgentQuoteSnapshot_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "borderwise"."AgentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."AgentProposal" ADD CONSTRAINT "AgentProposal_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "borderwise"."AgentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."AgentProposal" ADD CONSTRAINT "AgentProposal_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "borderwise"."AgentQuoteSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."AgentProposalPreview" ADD CONSTRAINT "AgentProposalPreview_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "borderwise"."AgentProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borderwise"."AgentToolExecution" ADD CONSTRAINT "AgentToolExecution_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "borderwise"."AgentTurn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- PostgreSQL equivalents of the custom SQLite checks and immutable audit guards.
ALTER TABLE "borderwise"."Profile" ADD CONSTRAINT "Profile_currency_check" CHECK ("homeCurrency" = 'MYR' AND "destinationCurrency" = 'KRW'),
  ADD CONSTRAINT "Profile_reserve_check" CHECK ("fixedReserveMinor" BETWEEN 0 AND 9007199254740991 AND "emergencyReserveMinor" BETWEEN 0 AND 9007199254740991 AND "fixedReserveMinor" + "emergencyReserveMinor" <= 9007199254740991);
ALTER TABLE "borderwise"."Account" ADD CONSTRAINT "Account_balance_check" CHECK ("balanceMinor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "Account_identity_check" CHECK (("id" = 'myr_funding' AND "currency" = 'MYR') OR ("id" IN ('krw_card', 'krw_cash') AND "currency" = 'KRW'));
ALTER TABLE "borderwise"."LedgerLine" ADD CONSTRAINT "LedgerLine_amount_check" CHECK ("amountMinor" BETWEEN -9007199254740991 AND 9007199254740991),
  ADD CONSTRAINT "LedgerLine_currency_check" CHECK ("currency" IN ('MYR', 'KRW'));
ALTER TABLE "borderwise"."Receivable" ADD CONSTRAINT "Receivable_amount_check" CHECK ("originalAmountMinor" BETWEEN 1 AND 9007199254740991 AND "settledMinor" BETWEEN 0 AND "originalAmountMinor"),
  ADD CONSTRAINT "Receivable_currency_check" CHECK ("currency" IN ('MYR', 'KRW'));
ALTER TABLE "borderwise"."Settlement" ADD CONSTRAINT "Settlement_amount_check" CHECK ("clearingMinor" BETWEEN 1 AND 9007199254740991 AND "receivedMinor" BETWEEN 1 AND 9007199254740991),
  ADD CONSTRAINT "Settlement_currency_check" CHECK ("clearingCurrency" IN ('MYR', 'KRW') AND "receivedCurrency" IN ('MYR', 'KRW'));
ALTER TABLE "borderwise"."PlanRecord" ADD CONSTRAINT "PlanRecord_status_check" CHECK ("status" IN ('pending', 'completed', 'cancelled'));
ALTER TABLE "borderwise"."AgentTurn" ADD CONSTRAINT "AgentTurn_status_check" CHECK ("status" IN ('processing', 'completed'));
ALTER TABLE "borderwise"."AgentMessage" ADD CONSTRAINT "AgentMessage_role_check" CHECK ("role" IN ('user', 'assistant'));
ALTER TABLE "borderwise"."SharedExpense" ADD CONSTRAINT "SharedExpense_amounts_check" CHECK ("billTotalMinor" BETWEEN 1 AND 9007199254740991 AND "payerShareMinor" BETWEEN 0 AND "billTotalMinor"),
  ADD CONSTRAINT "SharedExpense_currency_check" CHECK ("currency" IN ('MYR', 'KRW'));
ALTER TABLE "borderwise"."SharedExpenseAllocation" ADD CONSTRAINT "SharedExpenseAllocation_share_check" CHECK ("shareMinor" BETWEEN 1 AND 9007199254740991);
ALTER TABLE "borderwise"."ReceiptAttachment" ADD CONSTRAINT "ReceiptAttachment_size_check" CHECK ("byteSize" BETWEEN 1 AND 4194304 AND "width" BETWEEN 1 AND 4096 AND "height" BETWEEN 1 AND 4096);
ALTER TABLE "borderwise"."ReceiptDraft" ADD CONSTRAINT "ReceiptDraft_version_check" CHECK ("currentVersion" > 0);
ALTER TABLE "borderwise"."ReceiptDraftVersion" ADD CONSTRAINT "ReceiptDraftVersion_version_check" CHECK ("version" > 0);

CREATE FUNCTION "borderwise"."reject_immutable_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '%', TG_ARGV[0] USING ERRCODE = '23514'; END;
$$;
CREATE FUNCTION "borderwise"."guard_plan_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."quoteJson" IS DISTINCT FROM OLD."quoteJson" OR NEW."contextJson" IS DISTINCT FROM OLD."contextJson" OR NEW."profileId" IS DISTINCT FROM OLD."profileId" THEN
    RAISE EXCEPTION 'Plan quote and routing snapshots are immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD."status" IN ('completed', 'cancelled') AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'Completed and cancelled plans cannot change status' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE FUNCTION "borderwise"."guard_proposal_scope"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "borderwise"."AgentQuoteSnapshot" WHERE "id" = NEW."snapshotId" AND "sessionId" = NEW."sessionId") THEN
    RAISE EXCEPTION 'Agent quote and proposal must belong to the same session' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "PlanRecord_change_guard" BEFORE UPDATE ON "borderwise"."PlanRecord" FOR EACH ROW EXECUTE FUNCTION "borderwise"."guard_plan_change"();
CREATE TRIGGER "AgentQuoteSnapshot_immutable" BEFORE UPDATE ON "borderwise"."AgentQuoteSnapshot" FOR EACH ROW EXECUTE FUNCTION "borderwise"."reject_immutable_change"('Agent quote snapshots are immutable');
CREATE TRIGGER "AgentProposal_immutable" BEFORE UPDATE ON "borderwise"."AgentProposal" FOR EACH ROW EXECUTE FUNCTION "borderwise"."reject_immutable_change"('Agent proposal snapshots are immutable');
CREATE TRIGGER "AgentProposal_snapshot_scope" BEFORE INSERT ON "borderwise"."AgentProposal" FOR EACH ROW EXECUTE FUNCTION "borderwise"."guard_proposal_scope"();
CREATE TRIGGER "ReceiptDraft_extraction_immutable" BEFORE UPDATE OF "extractedJson", "receiptId", "attachmentId", "sessionId" ON "borderwise"."ReceiptDraft" FOR EACH ROW EXECUTE FUNCTION "borderwise"."reject_immutable_change"('Original extraction and receipt ownership are immutable');
CREATE TRIGGER "ReceiptVersion_immutable" BEFORE UPDATE ON "borderwise"."ReceiptDraftVersion" FOR EACH ROW EXECUTE FUNCTION "borderwise"."reject_immutable_change"('Receipt versions are append only');
CREATE TRIGGER "ReceiptProposal_binding_immutable" BEFORE UPDATE OF "draftId", "version", "bindingHash", "allocationJson", "postingInputJson" ON "borderwise"."ReceiptSplitProposal" FOR EACH ROW EXECUTE FUNCTION "borderwise"."reject_immutable_change"('Trusted receipt proposal binding is immutable');

-- Backend-only tables. No direct anon/authenticated Data API access is granted.
REVOKE ALL ON SCHEMA "borderwise" FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA "borderwise" FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "borderwise" FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "borderwise" FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA "borderwise" REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA "borderwise" REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA "borderwise" REVOKE ALL ON FUNCTIONS FROM PUBLIC;
DO $$
DECLARE item record; role_name text;
BEGIN
  FOR item IN SELECT tablename FROM pg_tables WHERE schemaname = 'borderwise' LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'borderwise', item.tablename);
  END LOOP;
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA borderwise FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA borderwise FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA borderwise FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA borderwise FROM %I', role_name);
    END IF;
  END LOOP;
END;
$$;

COMMIT;

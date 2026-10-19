-- Additive only: existing financial tables and records are not rebuilt or reset.
CREATE TABLE "SharedExpense" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "paidAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SharedExpense_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SharedExpense_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SharedExpense_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "LedgerEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SharedExpense_paidFromAccount_fkey" FOREIGN KEY ("paidFromAccount") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SharedExpense_amounts_check" CHECK (typeof("billTotalMinor") = 'integer' AND typeof("payerShareMinor") = 'integer' AND "billTotalMinor" BETWEEN 1 AND 9007199254740991 AND "payerShareMinor" BETWEEN 0 AND "billTotalMinor"),
    CONSTRAINT "SharedExpense_currency_check" CHECK ("currency" IN ('MYR', 'KRW'))
);
CREATE UNIQUE INDEX "SharedExpense_activityId_key" ON "SharedExpense"("activityId");
CREATE UNIQUE INDEX "SharedExpense_ledgerEntryId_key" ON "SharedExpense"("ledgerEntryId");
CREATE UNIQUE INDEX "SharedExpense_profileId_splitId_key" ON "SharedExpense"("profileId", "splitId");
-- First handover supports exactly one payment/allocation per receipt.
CREATE UNIQUE INDEX "SharedExpense_profileId_receiptId_key" ON "SharedExpense"("profileId", "receiptId");

CREATE TABLE "SharedExpenseAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sharedExpenseId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "shareMinor" BIGINT NOT NULL,
    "receivableId" TEXT NOT NULL,
    CONSTRAINT "SharedExpenseAllocation_sharedExpenseId_fkey" FOREIGN KEY ("sharedExpenseId") REFERENCES "SharedExpense" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SharedExpenseAllocation_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "Receivable" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SharedExpenseAllocation_share_check" CHECK (typeof("shareMinor") = 'integer' AND "shareMinor" BETWEEN 1 AND 9007199254740991)
);
CREATE UNIQUE INDEX "SharedExpenseAllocation_receivableId_key" ON "SharedExpenseAllocation"("receivableId");
CREATE UNIQUE INDEX "SharedExpenseAllocation_sharedExpenseId_participantId_key" ON "SharedExpenseAllocation"("sharedExpenseId", "participantId");

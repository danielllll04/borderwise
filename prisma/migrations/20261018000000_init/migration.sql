-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "homeCurrency" TEXT NOT NULL DEFAULT 'MYR',
    "destinationCurrency" TEXT NOT NULL DEFAULT 'KRW',
    "fixedReserveMinor" BIGINT NOT NULL,
    "emergencyReserveMinor" BIGINT NOT NULL,
    "fixedReserveBadgeJson" TEXT NOT NULL,
    "emergencyBadgeJson" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Profile_currency_check" CHECK ("homeCurrency" = 'MYR' AND "destinationCurrency" = 'KRW'),
    CONSTRAINT "Profile_reserve_check" CHECK (
      typeof("fixedReserveMinor") = 'integer' AND typeof("emergencyReserveMinor") = 'integer'
      AND "fixedReserveMinor" BETWEEN 0 AND 9007199254740991
      AND "emergencyReserveMinor" BETWEEN 0 AND 9007199254740991
      AND "fixedReserveMinor" + "emergencyReserveMinor" <= 9007199254740991
    )
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "balanceMinor" BIGINT NOT NULL DEFAULT 0,
    "balanceBadgeJson" TEXT NOT NULL,
    "balanceProvenanceJson" TEXT NOT NULL,
    CONSTRAINT "Account_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Account_balance_check" CHECK (typeof("balanceMinor") = 'integer' AND "balanceMinor" BETWEEN 0 AND 9007199254740991),
    CONSTRAINT "Account_identity_check" CHECK (
      ("id" = 'myr_funding' AND "currency" = 'MYR') OR
      ("id" IN ('krw_card', 'krw_cash') AND "currency" = 'KRW')
    )
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "inputJson" TEXT NOT NULL,
    "inputProvenanceJson" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Activity_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "badgeJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerEntry_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LedgerEntry_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LedgerLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    CONSTRAINT "LedgerLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "LedgerEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LedgerLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LedgerLine_amount_check" CHECK (typeof("amountMinor") = 'integer' AND "amountMinor" BETWEEN -9007199254740991 AND 9007199254740991),
    CONSTRAINT "LedgerLine_currency_check" CHECK ("currency" IN ('MYR', 'KRW'))
);

-- CreateTable
CREATE TABLE "Receivable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "debtor" TEXT NOT NULL,
    "originalAmountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "amountBadgeJson" TEXT NOT NULL,
    "settledMinor" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "Receivable_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Receivable_amount_check" CHECK (
      typeof("originalAmountMinor") = 'integer' AND typeof("settledMinor") = 'integer'
      AND "originalAmountMinor" BETWEEN 1 AND 9007199254740991
      AND "settledMinor" BETWEEN 0 AND "originalAmountMinor"
    ),
    CONSTRAINT "Receivable_currency_check" CHECK ("currency" IN ('MYR', 'KRW'))
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "clearingMinor" BIGINT NOT NULL,
    "clearingCurrency" TEXT NOT NULL,
    "receivedMinor" BIGINT NOT NULL,
    "receivedCurrency" TEXT NOT NULL,
    "receivingAccountId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Settlement_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Settlement_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "Receivable" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Settlement_amount_check" CHECK (
      typeof("clearingMinor") = 'integer' AND typeof("receivedMinor") = 'integer'
      AND "clearingMinor" BETWEEN 1 AND 9007199254740991
      AND "receivedMinor" BETWEEN 1 AND 9007199254740991
    ),
    CONSTRAINT "Settlement_currency_check" CHECK ("clearingCurrency" IN ('MYR', 'KRW') AND "receivedCurrency" IN ('MYR', 'KRW'))
);

-- CreateIndex
CREATE UNIQUE INDEX "Activity_idempotencyKey_key" ON "Activity"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LedgerEntry_profileId_createdAt_id_idx" ON "LedgerEntry"("profileId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "LedgerEntry_activityId_idx" ON "LedgerEntry"("activityId");

-- CreateIndex
CREATE INDEX "LedgerLine_entryId_idx" ON "LedgerLine"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_activityId_key" ON "Settlement"("activityId");

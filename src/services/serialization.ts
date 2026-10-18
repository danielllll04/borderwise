import type { Account, LedgerEntry as DbEntry, LedgerLine, Receivable as DbReceivable } from '@prisma/client';
import type { Currency, LedgerEntry, Receivable, RateSnapshot } from '../shared/models.js';
import { financialValue, readBadge } from '../domain/provenance.js';
import { safeNumber } from '../domain/validation.js';

export function accountResponse(account: Account) {
  return {
    account_id: account.id,
    display_name: account.displayName,
    balance: financialValue(safeNumber(account.balanceMinor), account.currency as Currency, readBadge(account.balanceBadgeJson)),
  };
}

export function ledgerContract(entry: DbEntry & { lines: LedgerLine[] }): LedgerEntry {
  return {
    entry_id: entry.id,
    type: entry.type as LedgerEntry['type'],
    lines: [...entry.lines].sort((a, b) => a.accountId.localeCompare(b.accountId)).map(line => ({
      account: line.accountId,
      Money: { amount_minor: safeNumber(line.amountMinor), currency: line.currency as Currency },
    })),
    badge: readBadge(entry.badgeJson),
  };
}

export function receivableContract(receivable: DbReceivable): Receivable {
  return {
    receivable_id: receivable.id,
    debtor: receivable.debtor,
    amount: { amount_minor: safeNumber(receivable.originalAmountMinor), currency: receivable.currency as Currency },
    snapshot: JSON.parse(receivable.snapshotJson) as RateSnapshot,
    settled: receivable.settledMinor === receivable.originalAmountMinor,
  };
}

export type AccountResponse = ReturnType<typeof accountResponse>;

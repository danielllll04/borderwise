import { randomUUID } from 'node:crypto';
import { payloadHash as hashPayload } from '../domain/idempotency.js';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { AccountId } from '../domain/accounts.js';
import { AppError } from '../domain/errors.js';
import { deriveBadge, financialValue, readBadge, type FinancialValue } from '../domain/provenance.js';
import { safeNumber } from '../domain/validation.js';
import type { Badge, Currency, LedgerEntry, Money, RateSnapshot, Receivable } from '../shared/models.js';
import { postingSchema, type PostingInput } from './posting-inputs.js';
import { accountResponse, ledgerContract, receivableContract, type AccountResponse } from './serialization.js';

export interface PostingResult {
  activity_id: string;
  entries: LedgerEntry[];
  balances: AccountResponse[];
  settlement?: {
    receivable: Receivable;
    amount_badge: Badge;
    cleared: FinancialValue;
    received: FinancialValue;
    remaining: FinancialValue;
  };
}

interface DraftEntry {
  type: LedgerEntry['type'];
  badge: Badge;
  lines: { account: AccountId; Money: Money }[];
}

function sameCurrency(left: Money, right: Money): void {
  if (left.currency === right.currency && left.amount_minor !== right.amount_minor) {
    throw new AppError(422, 'PRINCIPAL_MISMATCH', 'Same-currency principal and received amounts must match; record fees separately');
  }
}

function validateSnapshot(snapshot: RateSnapshot | undefined, from: Currency, to: Currency): void {
  if (snapshot && snapshot.pair !== `${from}/${to}`) {
    throw new AppError(422, 'RATE_PAIR_MISMATCH', 'The supplied rate snapshot must describe source/receiving currencies');
  }
  // No multiplication: actual user-reported received amounts are authoritative.
}

/** Sole writer of balances/ledger. Trusted workflow adapters compose transaction-bound methods. */
export class LedgerService {
  constructor(private readonly db: PrismaClient) {}

  async post(rawInput: PostingInput): Promise<PostingResult> {
    const input = postingSchema.parse(rawInput);
    const payloadHash = hashPayload(input);
    try {
      return await this.db.$transaction(tx => this.postInTransaction(tx, input), { maxWait: 5000, timeout: 15000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // A simultaneous identical request may win the unique-key race or SQLite write lock.
        if (['P2002', 'P1008', 'P2028', 'P2034'].includes(error.code)) {
          const previous = await this.db.activity.findUnique({ where: { idempotencyKey: input.idempotency_key } });
          if (previous) return this.replay(previous, payloadHash);
          throw new AppError(503, 'DATABASE_BUSY', 'Concurrent database activity; retry with the same idempotency key');
        }
      }
      throw error;
    }
  }

  /** Read-only validation and account projections, shared by previews and posting. */
  async prepareInTransaction(tx: Prisma.TransactionClient, rawInput: PostingInput) {
    const input = postingSchema.parse(rawInput);
    const profile = await tx.profile.findUnique({ where: { id: input.profile_id } });
    if (!profile) throw new AppError(404, 'PROFILE_NOT_FOUND', 'Financial profile does not exist; run the seed command');
    const accounts = await tx.account.findMany({ where: { profileId: input.profile_id }, orderBy: { id: 'asc' } });
    const byId = new Map(accounts.map(account => [account.id, account]));
    const drafts: DraftEntry[] = [];
    const addLine = (account: AccountId, money: Money, negative = false) => {
      const stored = byId.get(account);
      if (!stored) throw new AppError(404, 'ACCOUNT_NOT_FOUND', `Account ${account} does not belong to this profile`);
      if (stored.currency !== money.currency) throw new AppError(422, 'CURRENCY_MISMATCH', `Account ${account} uses ${stored.currency}`);
      return { account, Money: { ...money, amount_minor: negative ? safeNumber(-BigInt(money.amount_minor)) : money.amount_minor } };
    };

    let receivable: Awaited<ReturnType<typeof tx.receivable.findUnique>> = null;
    if (input.kind === 'income') {
      drafts.push({ type: 'income', badge: input.badge, lines: [addLine(input.account_id, input.amount)] });
    } else if (input.kind === 'settlement') {
      receivable = await tx.receivable.findUnique({ where: { id: input.receivable_id } });
      if (!receivable || receivable.profileId !== input.profile_id) throw new AppError(404, 'RECEIVABLE_NOT_FOUND', 'Receivable does not belong to this profile');
      if (receivable.currency !== input.amount_cleared.currency) throw new AppError(422, 'CURRENCY_MISMATCH', 'Clear the receivable in its original receipt currency');
      if (receivable.settledMinor + BigInt(input.amount_cleared.amount_minor) > receivable.originalAmountMinor) {
        throw new AppError(409, 'OVER_SETTLEMENT', 'Settlement exceeds the remaining receivable');
      }
      sameCurrency(input.amount_cleared, input.amount_received);
      validateSnapshot(input.rate_snapshot, input.amount_cleared.currency, input.amount_received.currency);
      drafts.push({ type: 'settlement', badge: input.badge, lines: [addLine(input.receiving_account, input.amount_received)] });
    } else {
      if (input.source_account === input.destination_account) throw new AppError(422, 'SAME_ACCOUNT', 'Source and destination accounts must differ');
      if (input.kind === 'exchange' && input.principal.currency === input.received.currency) {
        throw new AppError(422, 'EXCHANGE_CURRENCY_MISMATCH', 'An exchange must use different currencies');
      }
      sameCurrency(input.principal, input.received);
      validateSnapshot(input.rate_snapshot, input.principal.currency, input.received.currency);
      drafts.push({
        type: input.kind, badge: input.badge,
        lines: [addLine(input.source_account, input.principal, true), addLine(input.destination_account, input.received)],
      });
    }

    if (input.kind !== 'income') {
      for (const fee of input.fees) {
        drafts.push({ type: 'fee', badge: fee.badge, lines: [addLine(fee.account_id, fee.Money, true)] });
      }
    }

    const deltas = new Map<string, bigint>();
    const accountInputs = new Map<string, Badge[]>();
    for (const draft of drafts) {
      for (const line of draft.lines) {
        deltas.set(line.account, (deltas.get(line.account) ?? 0n) + BigInt(line.Money.amount_minor));
        accountInputs.set(line.account, [...(accountInputs.get(line.account) ?? []), draft.badge]);
      }
    }

    const changes = [...deltas].map(([id, delta]) => {
      const account = byId.get(id)!;
      const next = account.balanceMinor + delta;
      if (next < 0n) throw new AppError(409, 'INSUFFICIENT_FUNDS', `Activity would make ${account.displayName} negative`);
      safeNumber(next);
      const lines = drafts.flatMap(draft => draft.lines).filter(line => line.account === id);
      const debit = lines.reduce((sum, line) => sum + (line.Money.amount_minor < 0 ? -BigInt(line.Money.amount_minor) : 0n), 0n);
      const credit = lines.reduce((sum, line) => sum + (line.Money.amount_minor > 0 ? BigInt(line.Money.amount_minor) : 0n), 0n);
      return { account, delta, next, debit, credit, inputBadges: accountInputs.get(id)! };
    });
    return { profile, accounts, byId, drafts, deltas, accountInputs, receivable, changes };
  }

  /** Trusted caller owns the transaction: ledger posting and plan completion commit together. */
  async postInTransaction(tx: Prisma.TransactionClient, rawInput: PostingInput): Promise<PostingResult> {
    const input = postingSchema.parse(rawInput);
    const payloadHash = hashPayload(input);
    const previous = await tx.activity.findUnique({ where: { idempotencyKey: input.idempotency_key } });
    if (previous) return this.replay(previous, payloadHash);

    const { byId, drafts, deltas, accountInputs, receivable } = await this.prepareInTransaction(tx, input);
    const activityId = randomUUID();
    const provenance = [];
    for (const [id, delta] of deltas) {
      const account = byId.get(id)!;
      const next = account.balanceMinor + delta;
      if (next < 0n) throw new AppError(409, 'INSUFFICIENT_FUNDS', `Activity would make ${account.displayName} negative`);
      safeNumber(next);
      const inputs = [readBadge(account.balanceBadgeJson), ...accountInputs.get(id)!];
      const badge = deriveBadge(inputs, `Previous ${account.displayName} balance + signed ledger lines for activity ${activityId}; includes principal and separate fees`);
      provenance.push({ account_id: id, previous_balance_minor: safeNumber(account.balanceMinor), delta_minor: delta.toString(), input_badges: inputs });
      // Compare-and-update also guards concurrent writers. All mutations roll back together.
      const updated = await tx.account.updateMany({
        where: { id, balanceMinor: account.balanceMinor },
        data: { balanceMinor: next, balanceBadgeJson: JSON.stringify(badge), balanceProvenanceJson: JSON.stringify({ activity_id: activityId, input_badges: inputs }) },
      });
      if (updated.count !== 1) throw new AppError(409, 'CONCURRENT_UPDATE', 'Balance changed concurrently; retry with the same idempotency key');
    }
    await tx.activity.create({ data: {
      id: activityId, profileId: input.profile_id, kind: input.kind,
      idempotencyKey: input.idempotency_key, payloadHash, inputJson: JSON.stringify(input),
      inputProvenanceJson: JSON.stringify(provenance), resultJson: '{}',
    } });
    const entries: LedgerEntry[] = [];
    for (const draft of drafts) {
      const entry = await tx.ledgerEntry.create({ data: {
        id: randomUUID(), profileId: input.profile_id, activityId, type: draft.type,
        badgeJson: JSON.stringify(draft.badge),
        lines: { create: draft.lines.map(line => ({ id: randomUUID(), accountId: line.account, amountMinor: BigInt(line.Money.amount_minor), currency: line.Money.currency })) },
      }, include: { lines: true } });
      entries.push(ledgerContract(entry));
    }
    const result: PostingResult = {
      activity_id: activityId, entries,
      balances: (await tx.account.findMany({ where: { profileId: input.profile_id }, orderBy: { id: 'asc' } })).map(accountResponse),
    };
    if (input.kind === 'settlement' && receivable) {
      const settled = receivable.settledMinor + BigInt(input.amount_cleared.amount_minor);
      const changed = await tx.receivable.updateMany({
        where: { id: receivable.id, settledMinor: receivable.settledMinor }, data: { settledMinor: settled },
      });
      if (changed.count !== 1) throw new AppError(409, 'CONCURRENT_UPDATE', 'Receivable changed concurrently; retry with the same idempotency key');
      await tx.settlement.create({ data: {
        id: randomUUID(), activityId, receivableId: receivable.id,
        clearingMinor: BigInt(input.amount_cleared.amount_minor), clearingCurrency: input.amount_cleared.currency,
        receivedMinor: BigInt(input.amount_received.amount_minor), receivedCurrency: input.amount_received.currency,
        receivingAccountId: input.receiving_account,
      } });
      const historical = await tx.settlement.findMany({
        where: { receivableId: receivable.id }, include: { activity: { select: { inputJson: true } } },
      });
      const remainingInputs = [readBadge(receivable.amountBadgeJson), ...historical.map(item => (JSON.parse(item.activity.inputJson) as PostingInput).badge)];
      result.settlement = {
        receivable: receivableContract({ ...receivable, settledMinor: settled }),
        amount_badge: readBadge(receivable.amountBadgeJson),
        cleared: financialValue(input.amount_cleared.amount_minor, input.amount_cleared.currency, input.badge),
        received: financialValue(input.amount_received.amount_minor, input.amount_received.currency, input.badge),
        remaining: financialValue(safeNumber(receivable.originalAmountMinor - settled), receivable.currency as Currency,
          deriveBadge(remainingInputs, 'Original receivable amount - sum of confirmed settlement clearing amounts in original receipt currency')),
      };
    }
    await tx.activity.update({ where: { id: activityId }, data: { resultJson: JSON.stringify(result) } });
    return result;
  }

  private replay(previous: { payloadHash: string; resultJson: string }, payloadHash: string): PostingResult {
    if (previous.payloadHash !== payloadHash) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was already used with a different payload');
    return JSON.parse(previous.resultJson) as PostingResult;
  }
}

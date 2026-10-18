import type { Prisma, PrismaClient, Profile } from '@prisma/client';
import { z } from 'zod';
import { DEMO_PROFILE_ID } from '../domain/accounts.js';
import { AppError } from '../domain/errors.js';
import { financialValue, makeBadge, readBadge } from '../domain/provenance.js';
import { assertReserveTotal, minorSchema, safeNumber } from '../domain/validation.js';
import { accountResponse, ledgerContract } from './serialization.js';
import { budgetResponse } from './budget.js';

export const profileUpdateSchema = z.object({
  display_name: z.string().trim().min(1).max(100).optional(),
  fixed_expense_reserve: z.object({ amount_minor: minorSchema, currency: z.literal('MYR') }).strict().optional(),
  emergency_reserve: z.object({ amount_minor: minorSchema, currency: z.literal('MYR') }).strict().optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'Provide at least one profile field');

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

function profileResponse(profile: Profile) {
  return {
    profile_id: profile.id,
    display_name: profile.displayName,
    home_currency: profile.homeCurrency,
    destination_currency: profile.destinationCurrency,
    fixed_expense_reserve: financialValue(safeNumber(profile.fixedReserveMinor), 'MYR', readBadge(profile.fixedReserveBadgeJson)),
    emergency_reserve: financialValue(safeNumber(profile.emergencyReserveMinor), 'MYR', readBadge(profile.emergencyBadgeJson)),
    updated_at: profile.updatedAt.toISOString(),
  };
}

async function requireProfile(tx: Prisma.TransactionClient) {
  const profile = await tx.profile.findUnique({ where: { id: DEMO_PROFILE_ID } });
  if (!profile) throw new AppError(404, 'PROFILE_NOT_FOUND', 'Demo profile is missing; run npm run db:seed');
  return profile;
}

export class HomeService {
  constructor(private readonly db: PrismaClient) {}

  async profile() {
    return this.db.$transaction(async tx => profileResponse(await requireProfile(tx)));
  }

  async updateProfile(raw: ProfileUpdate) {
    const input = profileUpdateSchema.parse(raw);
    return this.db.$transaction(async tx => {
      const current = await requireProfile(tx);
      const fixed = input.fixed_expense_reserve ? BigInt(input.fixed_expense_reserve.amount_minor) : current.fixedReserveMinor;
      const emergency = input.emergency_reserve ? BigInt(input.emergency_reserve.amount_minor) : current.emergencyReserveMinor;
      assertReserveTotal(fixed, emergency);
      const updated = await tx.profile.update({ where: { id: DEMO_PROFILE_ID }, data: {
        ...(input.display_name !== undefined ? { displayName: input.display_name } : {}),
        ...(input.fixed_expense_reserve !== undefined ? {
          fixedReserveMinor: fixed,
          fixedReserveBadgeJson: JSON.stringify(makeBadge('User-Entered', 'Fixed-expense reserve entered through the local demo profile API')),
        } : {}),
        ...(input.emergency_reserve !== undefined ? {
          emergencyReserveMinor: emergency,
          emergencyBadgeJson: JSON.stringify(makeBadge('User-Entered', 'Emergency reserve entered through the local demo profile API')),
        } : {}),
      } });
      return profileResponse(updated);
    });
  }

  async balances() {
    return this.db.$transaction(async tx => {
      await requireProfile(tx);
      return { balances: (await tx.account.findMany({ where: { profileId: DEMO_PROFILE_ID }, orderBy: { id: 'asc' } })).map(accountResponse) };
    });
  }

  async summary() {
    return this.db.$transaction(async tx => {
      const profile = await requireProfile(tx);
      const accounts = await tx.account.findMany({ where: { profileId: DEMO_PROFILE_ID }, orderBy: { id: 'asc' } });
      const funding = accounts.find(account => account.id === 'myr_funding');
      if (!funding) throw new AppError(409, 'INCOMPLETE_PROFILE', 'MYR Funding account is missing; run npm run db:seed');
      return { profile: profileResponse(profile), balances: accounts.map(accountResponse), budget: budgetResponse(profile, funding) };
    });
  }

  async ledger(limit: number, cursor?: string) {
    return this.db.$transaction(async tx => {
      await requireProfile(tx);
      const boundary = cursor ? await tx.ledgerEntry.findUnique({ where: { id: cursor } }) : null;
      if (cursor && (!boundary || boundary.profileId !== DEMO_PROFILE_ID)) throw new AppError(400, 'INVALID_CURSOR', 'Ledger cursor does not exist for this profile');
      const rows = await tx.ledgerEntry.findMany({
        where: { profileId: DEMO_PROFILE_ID, ...(boundary ? { OR: [
          { createdAt: { lt: boundary.createdAt } },
          { createdAt: boundary.createdAt, id: { lt: boundary.id } },
        ] } : {}) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
        include: { lines: true, activity: { select: { inputJson: true } } },
      });
      const page = rows.slice(0, limit);
      return {
        items: page.map(row => ({
          entry: ledgerContract(row), activity_id: row.activityId, created_at: row.createdAt.toISOString(),
          // Exact actual inputs, fees, currencies, snapshots and badges; separate from the shared entry.
          activity: JSON.parse(row.activity.inputJson) as import('./posting-inputs.js').PostingInput,
        })),
        next_cursor: rows.length > limit ? page.at(-1)!.id : null,
      };
    });
  }
}

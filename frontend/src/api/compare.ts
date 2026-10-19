import type { Quote, Selection, Money } from './types'

/** Seeded Compare provider. Steve's real engine replaces seedCompare(); the Selection shape stays identical. */
export type Objective = 'exchange' | 'card' | 'atm_withdrawal'
export type Mode = 'budget' | 'target'
const NOW = () => new Date().toISOString()
const SEEDS: Record<Objective, { name: string; rate: number; fee: number; source: string; fee2?: number }[]> = {
  exchange: [
    { name: 'Wise Sandbox', rate: 298, fee: 250, source: 'Wise Sandbox' },
    { name: 'KL Money Changer', rate: 296, fee: 100, source: 'Seeded sample' },
    { name: 'Bank Transfer', rate: 292, fee: 800, source: 'Seeded sample' },
  ],
  card: [
    { name: 'Visa', rate: 297, fee: 150, source: 'Visa Indicative' },
    { name: 'Mastercard', rate: 296, fee: 150, source: 'Mastercard Indicative' },
    { name: 'Debit card (bank rate)', rate: 293, fee: 300, source: 'Seeded sample' },
  ],
  atm_withdrawal: [
    { name: 'Global ATM (KB)', rate: 297, fee: 500, fee2: 0, source: 'Seeded sample' },
    { name: 'Shinhan ATM', rate: 296, fee: 500, fee2: 350, source: 'Seeded sample' },
    { name: 'Convenience-store ATM', rate: 294, fee: 500, fee2: 600, source: 'Seeded sample' },
  ],
}
export interface CompareInput { objective: Objective; mode: Mode; amount: number } // amount: MYR sen (budget) or KRW (target)
export const seedCompare = (i: CompareInput): { selection: Selection; source: string }[] => {
  const out = SEEDS[i.objective].map((s): { selection: Selection; source: string; net: number; debit: number } => {
    const fee = s.fee + (s.fee2 ?? 0) // sen
    const principal = i.mode === 'budget' ? Math.max(0, i.amount - fee) : Math.ceil((i.amount / s.rate) * 100)
    const net = i.mode === 'target' ? i.amount : Math.floor((principal / 100) * s.rate)
    const fees = [{ label: i.objective === 'atm_withdrawal' ? 'Home-bank fee' : 'Provider fee', Money: { amount_minor: s.fee, currency: 'MYR' } as Money }]
    if (s.fee2) fees.push({ label: 'ATM operator fee', Money: { amount_minor: s.fee2, currency: 'MYR' } })
    const quote: Quote = {
      quote_id: `${i.objective}-${s.name.replace(/\W+/g, '-').toLowerCase()}-${i.mode}-${i.amount}`,
      objective: i.objective === 'card' ? 'card_purchase' : i.objective, mode: i.mode === 'budget' ? 'fixed-budget' : 'fixed-target',
      funding_source: 'myr_funding', provider: s.name, rate: String(s.rate),
      principal: { amount_minor: principal, currency: 'MYR' }, fees,
      total_debit: { amount_minor: principal + fee, currency: 'MYR' }, net_received: { amount_minor: net, currency: 'KRW' },
      badge: { status: i.objective === 'card' ? 'Indicative' : 'Simulated', source: s.source, timestamp: NOW() },
    }
    return { selection: { quote, context: { destination_account: i.objective === 'atm_withdrawal' ? 'krw_cash' : 'krw_card', fee_accounts: fees.map(() => 'myr_funding' as const), fee_behavior: 'fixed' } }, source: s.source, net, debit: principal + fee }
  })
  return out.sort((a, b) => (i.mode === 'budget' ? b.net - a.net : a.debit - b.debit))
}

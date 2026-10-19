import type { HomeData } from '@/api/types'
import { Amount, Card } from './kit'
export default function HomeSummary({ h }: { h: HomeData }) {
  return <Card className="space-y-3 text-sm">{h.balances.map(b => <div key={b.account_id} className="flex items-start justify-between"><span className="text-ink/60">{b.display_name}</span><Amount v={b.balance} /></div>)}
    <div className="flex items-start justify-between border-t border-ink/10 pt-2"><span className="text-ink/60">Available above reserve</span><Amount v={h.budget.available_above_reserve} /></div></Card>
}

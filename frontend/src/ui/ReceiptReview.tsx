import UI from './i18n-view'
import { useEffect, useRef, useState } from 'react'
import type { AccountId, BalanceItem } from '@/api/types'
import { ApiError } from '@/api/types'
import type { AllocationReviewCard, BillConfirmation, BillResult, ReceiptData, ReceiptReviewCard } from '@/api/split-types'
import { uid } from '@/api/api'
import { useApp } from './ctx'
import { Amount, Badge, Btn, Card, Err, Modal, Warn, fmt } from './kit'
import { actualTime, enteredMoney, readWorkflow, units, writeWorkflow } from './split-state'

type EditFields = {merchant: string; date: string; items: {item_id: string; label: string; quantity: string; amount: string}[]; tax: string; discount: string; total: string}
type State = {attachment?: string; draft?: string; proposal?: string; form?: EditFields; formVersion?: number; selected?: string[]; assignments?: Record<string, string[]>; account?: AccountId; at?: string; attempt?: {proposal: string; body: BillConfirmation}; result?: BillResult}
const fields = (r: ReceiptData): EditFields => ({merchant: r.merchant ?? '', date: r.date ?? '', items: r.items.map(i => ({...i, amount: units(i.amount)})), tax: units(r.tax), discount: units(r.discount), total: units(r.total)})
const inputClass = 'mt-1 min-h-[44px] w-full rounded-xl border border-ink/15 bg-white px-3 text-sm'
export function ReceiptField({label, value, disabled, onChange}: {label: string; value: string; disabled?: boolean; onChange: (s: string) => void}) {
  const {t} = useApp()
  return <label className="block text-sm"><UI text={label} /><input aria-label={t(label)} className={inputClass} value={value} disabled={disabled} onChange={e => onChange(e.target.value)} /></label>
}
export function RecordedBill({data}: {data: BillResult}) {
  return <Card className="space-y-2 text-sm"><b><UI text="Shared expense recorded by Node" /></b><p><UI text="Full bill debit" /></p><Amount v={data.recorded_debit} /><p><UI text="Personal expense" /></p><Amount v={data.personal_expense} /><p><UI text="Authoritative receivables" /></p><Amount v={data.receivables_total} />{data.receivables.map(r => <p key={r.receivable.receivable_id}>{r.receivable.debtor}: {fmt(r.receivable.amount)} <UI text=" · participant " />{r.participant_id}</p>)}<Badge b={data.provenance} /><p className="break-all text-xs"><UI text="Activity " />{data.activity_id}</p><p><UI text="Recorded once. Refresh Home and Split reads separately." /></p></Card>
}

export default function ReceiptReview({session, draft, proposal, initialAllocation, workflow = 'upload', onClose, onDone, onAgentReview}: {session: string; draft?: string; proposal?: string; initialAllocation?: AllocationReviewCard; workflow?: string; onClose: () => void; onDone: () => void; onAgentReview?: (ref: {draft_id: string; version: number}) => void}) {
  const {api, bump} = useApp(), backend = api.splitBackend
  const key = `${backend?.storageNamespace}:receipt:${session}:${draft ?? workflow}`
  const [state, setState] = useState<State>(() => {
    const saved = readWorkflow<State>(key, {draft, proposal})
    return !saved.attempt && !saved.result && (proposal || initialAllocation) ? {...saved, draft, proposal} : saved
  })
  const current = useRef(state), lock = useRef(false)
  const [review, setReview] = useState<ReceiptReviewCard | null>(null), [allocation, setAllocation] = useState<AllocationReviewCard | null>(null)
  const [accounts, setAccounts] = useState<BalanceItem[]>([]), [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null), [notice, setNotice] = useState('')
  const [receiptAck, setReceiptAck] = useState(false), [allocationAck, setAllocationAck] = useState(false)
  const store = (next: State) => { writeWorkflow(key, next); current.current = next; setState(next) }
  const work = async (fn: () => Promise<void>) => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(null)
    try { await fn() } catch (e) { setError(e) } finally { lock.current = false; setBusy(false) }
  }
  const adopt = (r: ReceiptReviewCard, p?: AllocationReviewCard | null, reset = false) => {
    setReview(r); setAllocation(p ?? null)
    const s = current.current, keep = !reset && s.formVersion === r.version
    store({...s, draft: r.draft_id, proposal: p?.proposal_id ?? s.proposal, form: keep ? s.form : fields(r.reviewed), formVersion: r.version,
      selected: keep ? s.selected : p?.participants.map(i => i.participant_id) ?? s.selected ?? ['demo-profile'],
      assignments: keep ? s.assignments : p ? Object.fromEntries(p.assignments.map(i => [i.item_id, i.participant_ids])) : {},
      account: p?.paid_from_account as AccountId ?? s.account, at: p?.paid_at ?? s.at ?? new Date().toISOString()})
    setReceiptAck(false); setAllocationAck(false)
  }
  const load = async (reset = false) => {
    if (!backend) return
    const s = current.current
    // A confirmed result/ambiguous attempt remains usable even if optional reads fail.
    const p = (s.proposal ?? proposal) ? await backend.proposal(session, (s.proposal ?? proposal)!) : initialAllocation ?? null
    const id = draft ?? s.draft ?? p?.draft_id
    if (id) { const r = await backend.review(session, id); adopt(r, p?.version === r.version || p?.proposal_id ? p : null, reset) }
    if (api.homeBackend) setAccounts((await api.homeBackend.summary()).balances)
  }
  const startup = useRef(() => work(() => load()))
  useEffect(() => { void startup.current() }, [])
  if (!backend) return <Modal title="Receipt review" onClose={onClose}><Warn><UI text="Receipt review needs the connected Node backend." /></Warn></Modal>
  const update = (patch: Partial<State>) => { try { store({...current.current, ...patch}); setAllocation(null); setReceiptAck(false); setAllocationAck(false) } catch (e) { setError(e) } }
  const form = state.form, editable = !busy && !state.attempt && !state.result && review?.review_state !== 'confirmed'
  const assignmentKey = (items: {item_id: string; participant_ids: string[]}[]) => JSON.stringify(items.filter(i => i.participant_ids.length).map(i => ({item_id: i.item_id, participant_ids: [...i.participant_ids].sort()})).sort((a, b) => a.item_id.localeCompare(b.item_id)))
  const allocationMatches = Boolean(allocation && review && form && allocation.version === review.version
    && JSON.stringify(form) === JSON.stringify(fields(review.reviewed))
    && assignmentKey(Object.entries(state.assignments ?? {}).map(([item_id, participant_ids]) => ({item_id, participant_ids}))) === assignmentKey(allocation.assignments)
    && JSON.stringify([...(state.selected ?? [])].sort()) === JSON.stringify(allocation.participants.map(p => p.participant_id).sort())
    && state.account === allocation.paid_from_account && state.at === allocation.paid_at)
  const extract = () => work(async () => {
    let attachment = current.current.attachment
    if (!attachment) {
      if (!file || !['image/png', 'image/jpeg'].includes(file.type) || file.size > 4 * 1024 * 1024) throw new Error('Choose a PNG or JPEG up to 4 MiB.')
      const uploaded = await backend.upload(session, file)
      attachment = uploaded.attachment_id; store({...current.current, attachment})
    }
    adopt(await backend.extract(session, attachment)); setNotice('Extraction is review-only. Sample OCR is Simulated and has not read the image content.')
  })
  const saveEdits = () => work(async () => {
    if (!review || !form) return
    const c = review.reviewed.total.currency
    const receipt: ReceiptData = { ...(form.merchant ? {merchant: form.merchant} : {}), ...(form.date ? {date: form.date} : {}), items: form.items.map(i => ({...i, amount: enteredMoney(i.amount, c)})), tax: enteredMoney(form.tax, c, true), discount: enteredMoney(form.discount, c, true), total: enteredMoney(form.total, c) }
    const r = await backend.edit(session, review.draft_id, {expected_version: review.version, receipt})
    store({...current.current, proposal: undefined, assignments: {}}); adopt(r, null, true)
    setNotice('Corrections saved as a new version. Earlier proposals are invalid. Assign items again; no financial posting occurred.')
  })
  const allocate = () => work(async () => {
    if (!review || !form) return
    if (JSON.stringify(form) !== JSON.stringify(fields(review.reviewed))) throw new Error('Save receipt corrections before requesting allocation.')
    const s = current.current
    const p = await backend.allocate(session, review.draft_id, {expected_version: review.version, participant_ids: s.selected ?? ['demo-profile'], payer_id: 'demo-profile', ...(s.account ? {paid_from_account: s.account} : {}), ...(s.at ? {paid_at: actualTime(s.at)} : {}), assignments: Object.entries(s.assignments ?? {}).filter(([,ids]) => ids.length).map(([item_id, participant_ids]) => ({item_id, participant_ids})), payment_mode: 'new_payment'})
    // Retain the trusted ID before optional reads; a dropped read must not lose it.
    store({...current.current, proposal: p.proposal_id ?? undefined, formVersion: p.version}); setAllocation(p)
    adopt(await backend.review(session, review.draft_id), p)
    setNotice(p.proposal_id ? 'Allocation validated by Node. Review the trusted shares before explicit confirmation.' : 'Assignments need clarification. No trusted confirmation proposal or financial posting was created.')
  })
  const confirm = () => work(async () => {
    let attempt = current.current.attempt
    if (!attempt) {
      if (!allocation?.proposal_id || allocation.review_state !== 'review_required' || !allocationMatches || !receiptAck || !allocationAck) return
      attempt = {proposal: allocation.proposal_id, body: {frontend_action: 'confirm_reviewed_split', idempotency_key: `receipt-ui:${uid()}`, expected_version: allocation.version, receipt_review_acknowledged: true, allocation_review_acknowledged: true}}
      store({...current.current, attempt})
    }
    let result: BillResult
    try { result = await backend.confirmBill(session, attempt.proposal, attempt.body) }
    catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.code !== 'IDEMPOTENCY_CONFLICT') store({...current.current, attempt: undefined})
      throw e
    }
    // Success is final even if browser persistence or follow-up reads fail.
    const next = {...current.current, result, attempt: undefined}; current.current = next; setState(next)
    setNotice('Bill recorded successfully. Do not submit another bill to refresh balances.'); bump(); onDone()
    try { writeWorkflow(key, next) } catch { setNotice('Bill recorded successfully. Retry-state cleanup unavailable; the original key remains safe to recover.') }
  })
  return <Modal title="Receipt review" onClose={onClose}><div className="space-y-3">
    <Warn><UI text="Node is the sole financial writer. Upload, edits and allocation never post money. Current OCR returns Simulated sample output, regardless of the uploaded image." /></Warn>
    {busy && <p role="status"><UI text="Waiting for receipt service…" /></p>}<Err e={error} />{notice && <p role="status" className="text-sm text-emerald-800"><UI text={notice} /></p>}
    <Btn kind="outline" disabled={busy} onClick={() => void work(() => load(true))}><UI text="Refresh current receipt (discard unsaved edits)" /></Btn>
    {state.result && <RecordedBill data={state.result} />}
    {state.result && !draft && <Btn disabled={busy} onClick={() => { try { store({}); setReview(null); setAllocation(null); setFile(null); setNotice('Choose a different actual receipt. The earlier posting remains in Node history.'); setReceiptAck(false); setAllocationAck(false) } catch (e) { setError(e) } }}><UI text="Start a new receipt" /></Btn>}
    {state.attempt && !state.result && <Card><Warn><UI text="Confirmation outcome needs recovery. The exact proposal, version, acknowledgements and request key are retained. Retry only the original confirmation." /></Warn><Btn disabled={busy} onClick={() => void confirm()}><UI text="Retry original bill confirmation" /></Btn></Card>}
    {!state.draft && !review && !state.result && <Card className="space-y-2"><label className="block text-sm"><UI text="Receipt image" /><input aria-label="Receipt image" type="file" accept="image/png,image/jpeg" disabled={busy || Boolean(state.attachment)} onChange={e => setFile(e.target.files?.[0] ?? null)} className="mt-2 block w-full text-sm" /></label><Btn disabled={busy || !state.attachment && !file} onClick={() => void extract()}><UI text={state.attachment ? 'Retry extraction of uploaded image' : 'Upload and extract receipt'} /></Btn><p className="text-xs"><UI text="Private image; PNG/JPEG, at most 4 MiB. A lost upload response can require uploading again; no bill is posted." /></p></Card>}
    {review && form && <>
      {onAgentReview && <Btn kind="outline" disabled={busy || Boolean(state.attempt)} onClick={() => onAgentReview({draft_id: review.draft_id, version: review.version})}><UI text="Ask Agent to read this receipt" /></Btn>}
      <Card className="space-y-2 text-sm"><b><UI text="Original extraction · immutable" /></b><p>{review.extracted.receipt.merchant} · {fmt(review.extracted.receipt.total)}</p><Badge b={review.extracted.badge} />{review.extracted.fixture_notice && <p>{review.extracted.fixture_notice}</p>}{review.extracted.confidence !== undefined && <p><UI text="Supplied confidence: " />{review.extracted.confidence}</p>}<details><summary><UI text="Original items and source" /></summary>{review.extracted.receipt.items.map(i => <p key={i.item_id}>{i.label} · {i.quantity} · {fmt(i.amount)}</p>)}<p><UI text="Tax " />{fmt(review.extracted.receipt.tax)} <UI text=" · discount " />{fmt(review.extracted.receipt.discount)}</p></details></Card>
      <Card className="space-y-3"><b><UI text="Editable receipt · version " />{review.version} · {review.review_state}</b>{review.corrections_badge && <Badge b={review.corrections_badge} />}{review.review_issues.map(i => <Warn key={i.code}>{i.message}</Warn>)}
        <ReceiptField label="Merchant" value={form.merchant} disabled={!editable} onChange={merchant => update({form: {...form, merchant}})} /><ReceiptField label="Receipt date" value={form.date} disabled={!editable} onChange={date => update({form: {...form, date}})} />
        {form.items.map((i, index) => <div key={i.item_id} className="space-y-2 border-t border-ink/10 pt-2"><p className="text-xs"><UI text="Item " />{i.item_id}</p>{(['label', 'quantity', 'amount'] as const).map(field => <ReceiptField key={field} label={`Item ${index + 1} ${field}${field === 'amount' ? ` (${review.reviewed.total.currency} line total)` : ''}`} value={i[field]} disabled={!editable} onChange={value => update({form: {...form, items: form.items.map(x => x.item_id === i.item_id ? {...x, [field]: value} : x)}})} />)}</div>)}
        {(['tax', 'discount', 'total'] as const).map(field => <ReceiptField key={field} label={`${field} (${review.reviewed.total.currency})`} value={form[field]} disabled={!editable} onChange={value => update({form: {...form, [field]: value}})} />)}<Btn disabled={!editable} onClick={() => void saveEdits()}><UI text="Save receipt corrections" /></Btn>
      </Card>
      <Card className="space-y-3 text-sm"><b><UI text="Participants and item assignments" /></b><p><UI text="Current user pays. Choose stable IDs, including every person who shared an item. Blank assignments require review; no names are inferred." /></p>
        {review.participants.map(p => <label key={p.participant_id} className="flex min-h-[44px] items-center gap-2"><input type="checkbox" disabled={!editable || p.participant_id === 'demo-profile'} checked={state.selected?.includes(p.participant_id) ?? false} onChange={e => { const selected = e.target.checked ? [...(state.selected ?? []), p.participant_id] : (state.selected ?? []).filter(id => id !== p.participant_id); update({selected, assignments: Object.fromEntries(Object.entries(state.assignments ?? {}).map(([id, ids]) => [id, ids.filter(pid => selected.includes(pid))]))}) }} />{p.display_name} <span className="break-all text-xs text-ink/55">{p.participant_id}</span></label>)}
        {review.reviewed.items.map(item => <div key={item.item_id} className="border-t border-ink/10 pt-2"><b>{item.label} · {fmt(item.amount)}</b>{review.participants.filter(p => state.selected?.includes(p.participant_id)).map(p => <label key={p.participant_id} className="flex min-h-[44px] items-center gap-2"><input type="checkbox" aria-label={`${item.label}: ${p.display_name} (${p.participant_id})`} disabled={!editable} checked={state.assignments?.[item.item_id]?.includes(p.participant_id) ?? false} onChange={e => { const ids = state.assignments?.[item.item_id] ?? []; update({assignments: {...state.assignments, [item.item_id]: e.target.checked ? [...ids, p.participant_id] : ids.filter(id => id !== p.participant_id)}}) }} />{p.display_name} · {p.participant_id}</label>)}</div>)}
        <label className="block"><UI text="Actual paying account" /><select aria-label="Actual paying account" className={inputClass} disabled={!editable} value={state.account ?? ''} onChange={e => update({account: e.target.value as AccountId})}><option value=""><UI text="Choose account" /></option>{accounts.filter(a => a.balance.Money.currency === review.reviewed.total.currency).map(a => <option key={a.account_id} value={a.account_id}><UI text={a.display_name} /></option>)}</select></label><ReceiptField label="Actual bill payment timestamp (ISO timezone)" value={state.at ?? ''} disabled={!editable} onChange={at => update({at})} /><p className="text-xs"><UI text="Same-currency bill/payment only. Existing payment linking and other payers are unsupported. Check the actual timestamp." /></p><Btn disabled={!editable} onClick={() => void allocate()}><UI text="Request allocation preview" /></Btn>
      </Card>
    </>}
    {allocation && <Card className="space-y-3 text-sm"><b><UI text="Trusted allocation · version " />{allocation.version} · {allocation.review_state}</b>{allocation.proposal_id && <p className="break-all text-xs"><UI text="Proposal " />{allocation.proposal_id}</p>}{allocation.clarification.map(q => <Warn key={q.field}>{q.question}</Warn>)}{allocation.allocation && <><p><UI text="Total " />{fmt(allocation.allocation.total)} <UI text=" · payer " />{fmt(allocation.allocation.payer_share)}</p>{allocation.allocation.debtor_shares.map(s => <p key={s.participant_id}>{allocation.participants.find(p => p.participant_id === s.participant_id)?.display_name} ({s.participant_id}): {fmt(s.share)}</p>)}<Badge b={allocation.allocation.badge} /><p><UI text="Node reconciliation: " /><UI text={allocation.reconciliation} /><UI text=". Account " />{allocation.paid_from_account}<UI text="; paid at " />{allocation.paid_at}.</p></>}{allocation.assumptions_requiring_confirmation.map(s => <p key={s}>{s}</p>)}{allocation.review_state === 'stale' && <Warn><UI text="This proposal is stale. Refresh the receipt and allocate the current version." /></Warn>}{allocation.review_state === 'review_required' && !allocationMatches && <Warn><UI text="Local inputs differ from this allocation. Save corrections and request a new allocation before confirming." /></Warn>}
      {allocation.review_state === 'review_required' && allocationMatches && allocation.proposal_id && !state.result && !state.attempt && <><label className="flex min-h-[44px] items-center gap-2"><input type="checkbox" checked={receiptAck} disabled={busy} onChange={e => setReceiptAck(e.target.checked)} /><UI text="I reviewed the receipt and original provenance" /></label><label className="flex min-h-[44px] items-center gap-2"><input type="checkbox" checked={allocationAck} disabled={busy} onChange={e => setAllocationAck(e.target.checked)} /><UI text="I confirm assignments, payer, account and actual payment time" /></label><Warn><UI text="Explicit confirmation records the full bill debit once and creates linked receivables. This records an actual payment; it does not execute a payment." /></Warn><Btn disabled={busy || !receiptAck || !allocationAck} onClick={() => void confirm()}><UI text="Confirm reviewed bill" /></Btn></>}
    </Card>}
  </div></Modal>
}

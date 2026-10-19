# Confirmed shared expenses: proposed Split handover

**Integration proposal for Steve; not an agreed or live Split contract.** Steve owns receipt OCR/review, item allocation, deterministic share calculations and Split records. Money & Ledger validates the confirmed allocation, owns balances, posts the payment and creates authoritative receivables/settlements. No OCR, allocation algorithm, Agent write tool or frontend is added. The subsequent [pending-plan risk service](pending-plan-risk.md) provides a separate read after posting; it never changes a pending plan or adds a posting prerequisite.

## Explicit confirmation API

`POST /api/shared-expenses/confirm` on the existing local backend. The future frontend must display the reviewed split and obtain an explicit confirmation before calling this endpoint. `frontend_action` is required protocol metadata, not authentication or proof of a secure click. The existing local demo has no authentication and resolves the current user to `demo-profile`; external callers cannot supply another financial profile.

The exported `ConfirmedSplitInput` and `confirmedSplitSchema` in `src/services/shared-expense-inputs.ts` define the strict proposed request. Amounts are integer minor units: MYR sen and KRW whole won.

```json
{
  "frontend_action": "confirm_shared_expense",
  "idempotency_key": "confirmed-split-001",
  "split_id": "steve-split-001",
  "receipt_id": "steve-receipt-001",
  "payer": { "participant_id": "demo-profile" },
  "paid_from_account": "krw_card",
  "bill_total": { "amount_minor": 50000, "currency": "KRW" },
  "payer_share": { "amount_minor": 15000, "currency": "KRW" },
  "participants": [
    { "participant_id": "daniel", "display_name": "Daniel", "share": { "amount_minor": 21000, "currency": "KRW" } },
    { "participant_id": "tze-loon", "display_name": "Tze Loon", "share": { "amount_minor": 14000, "currency": "KRW" } }
  ],
  "badge": {
    "status": "Simulated",
    "source": "Fictional receipt for proposed Split handover",
    "timestamp": "2026-10-19T00:00:00.000Z"
  },
  "paid_at": "2026-10-19T00:00:00.000Z",
  "payment_mode": "new_payment"
}
```

- `payer.participant_id` must equal the current user's stable ID (`demo-profile` in this demo). Other-payer payments return 422 `OTHER_PAYER_UNSUPPORTED` without debiting this user. Steve must align participant-to-profile identity mapping before production integration.
- Stable nonempty split, receipt and participant IDs are at most 100 characters. `display_name` is optional and is never an identity key. Participants must be unique, exclude the payer and have positive shares; the payer's share may be zero. All shares use the bill currency and must sum exactly using integer arithmetic. Empty participants are valid when the payer bears the entire bill.
- `paid_from_account` uses the existing `myr_funding`, `krw_card` or `krw_cash` identifiers and is checked for profile ownership and currency.
- Optional `rate_snapshot` is the existing shared RateSnapshot. It is retained as source context only. It never determines the actual debit. Bill and funding-account currencies must match in this step; a mismatch returns 422 `CROSS_CURRENCY_PAYMENT_UNSUPPORTED`, even if a rate is supplied.
- `badge` retains the original receipt/input provenance. User confirmation is recorded separately and does not turn Simulated or Indicative source data into verified real-world data. `paid_at` is the reported payment time; posting/confirmation time is separate.
- `payment_mode` is `new_payment` or `link_existing`. Linking requires `existing_payment_reference`, then returns 422 `PAYMENT_LINKING_UNSUPPORTED`: no suitable existing standalone bill-payment representation exists. Exchange, withdrawal, fee and repayment entries cannot be reinterpreted as bill purchases. No new debit or allocation occurs. A reference on `new_payment` returns 400 `UNEXPECTED_PAYMENT_REFERENCE`.

## Response wrapper

HTTP 200 returns the exported `SharedExpenseConfirmationResult` (with `SharedExpenseDetails`):

```text
{
  posting_id, activity_id, split_id, receipt_id, paid_from_account,
  bill_total: { Money, badge },
  recorded_debit: { Money, badge },
  personal_expense: { Money, badge },
  receivables_total: { Money, badge },
  receivables: [{ participant_id, receivable: <existing shared Receivable>, amount_badge }],
  ledger_entry_ids, entries: [<shared LedgerEntry>],
  balances: [<existing account response>], budget: <existing MYR reserve budget>,
  paid_at, payment_mode: "new_payment", provenance: <original Badge>,
  confirmation: { frontend_action: "confirm_shared_expense", acknowledged: true, recorded_at }
  pending_plan_follow_up: { status: "refresh_required", method: "GET", url: "/api/plans/assessments", financial_action_succeeded: true, retry_financial_action: false }
}
```

`recorded_debit` is the positive magnitude actually recorded against the funding account, explicitly separate from `bill_total`. They are equal only because this version supports same-currency payments. The signed ledger line is negative. Responses are snapshots as of posting, including replay responses. GET `/api/home` and `/api/balances` provide fresh balances/budget; `/api/ledger` exposes the original allocation in its existing activity wrapper.

## Accounting and settlement

The existing `LedgerService` remains the sole nonzero balance/ledger writer. One database transaction performs account compare-and-update, Activity, one `shared_expense` LedgerEntry, SharedExpense allocation record, participant Receivables and SharedExpenseAllocation links, and the original idempotent response. Every write rolls back on failure.

For the example, KRW Card is debited 50000 once. The only signed account line is `krw_card: -50000 KRW`; personal expense is 15000 and receivables are 21000 + 14000 = 35000. No fake expense/receivable cash accounts, extra cash debits, fee entries or income entries are created. The shared ledger entry describes gross cash paid; consumers must use the allocation wrapper for personal spending rather than treating the gross line as personal expense.

GET `/api/home` adds backend wrapper `shared_expense_totals`, grouped by currency, with `count`, separately badged `gross_cash_paid`, `personal_expense` and `receivables_created`. These are totals of confirmed shared expenses only, not all spending, income or outstanding debt. Repayments do not change these historical totals. Never add gross cash paid to personal expense. The existing shared financial model fields remain intact apart from the explicitly proposed ledger type addition.

Receivables keep the bill currency and original amount. Their required shared `snapshot` is a same-currency identity (`KRW/KRW` or `MYR/MYR`, rate `1`) with conservatively derived source provenance; this is not a market FX quote. The optional original FX snapshot stays in the activity input. Stable participant links are internal; the existing shared `debtor` remains its display label.

The existing `LedgerService.post(kind: 'settlement', ...)` supports these receivables without another service or new settlement endpoint. A partial repayment increases the receiving account, advances settledMinor and retains the original receivable amount. Full repayment marks it settled. Neither is income, and over-settlement remains rejected. Existing cross-currency settlement support requires explicit actual received and original-currency cleared amounts; it is unchanged by this handover's same-currency payment restriction.

This records a payment reported to have already happened. Falling below the existing MYR reserve does **not** block it or require reserve acknowledgement; successful posting returns the updated budget. KRW balances remain excluded from that MYR-only budget. Negative tracked balances remain prohibited. Insufficient tracked funds return 409 `RECONCILIATION_REQUIRED` with no writes: reconcile through an explicit supported balance-correction process before retrying. There is currently no dedicated reconciliation HTTP workflow; do not fabricate income or silently change a balance to bypass this error.

## Idempotency and concurrency

- Keep the same `idempotency_key` (1–200 characters) for network retries. The service namespaces a hash of it by operation/profile using existing Activity idempotency semantics. Same validated payload replays the original IDs and response; a changed payload with that key returns 409 `IDEMPOTENCY_CONFLICT`. Participant array order is part of the payload.
- Database unique constraints allow one allocation per `(profile, split_id)` and per `(profile, receipt_id)`, one allocation per payment Activity/entry, and one receivable per participant allocation. A fresh key cannot post the same split or receipt again: 409 `SPLIT_ALREADY_RECORDED`. This first step deliberately disallows multiple payments or alternate allocations for a receipt; editing/correction and multi-payment receipts need a later explicit contract.
- Concurrent requests cannot duplicate cash debits or receivables. A same-key winner may be replayed. SQLite contention may return 503 `DATABASE_BUSY` or 409 `CONCURRENT_UPDATE`; retry with the original key. A different-key loser resolves to the duplicate conflict once the winner commits. Unique constraints and account compare-and-update back the transaction checks.
- Schema errors use the existing 400 `VALIDATION_ERROR` envelope. Financial validation uses 422 `ALLOCATION_MISMATCH`, `INVALID_PARTICIPANTS` or `CURRENCY_MISMATCH`. Failures preserve financial state.

## Run locally and proposed changes Steve must align

```powershell
npm run db:generate
npm run db:migrate
npm run build
npm run typecheck
npm run lint
npm run demo:split
```

The new migration only adds allocation tables, indexes and constraints; it does not reset or rewrite existing data. `demo:split` creates/migrates/seeds a fresh temporary SQLite database, submits the simulated fixture through the explicit API, records a simulated partial settlement through the existing service, and removes its temporary database. It never posts to the configured financial database or calls Groq/Steve. Fixture source: `scripts/fixtures/confirmed-split.ts`. No test suite is added.

Steve must align **these proposals**: the request/response wrappers above; stable participant/profile identity mapping; one payment per split/receipt and retry keys; source Badge preservation plus separate confirmation metadata; original bill currency vs actual debit; and the additive shared `LedgerEntry.type = "shared_expense"`. Existing values (`income`, `exchange`, `atm_withdrawal`, `fee`, `settlement`) and every shared LedgerEntry field remain unchanged. His schema/parser and frontend ledger consumers must accept the new value and use the personal allocation for expense summaries.

Still unsupported: linking existing payments, cross-currency bill payments, other-payer scenarios, correction/reallocation of recorded expenses, multi-payment receipts, live Split ingestion, authentication, frontend confirmation screens and Agent financial write tools. Pending-plan assessments are available as an optional separate read; posting does not invoke or depend on them. Ordinary card purchases remain unsupported; this narrow confirmed shared-expense record does not implement card execution. Real Groq verification remains on hold.

The subsequent [Agent receipt-review workflow](receipt-review.md) now supports pre-posting receipt edits and assignment proposals through proposed adapters. Its separate frontend confirmation calls `SharedExpenseService.confirmInTransaction` so the trusted current version, receipt claim, ledger posting and durable confirmation result commit together. It does not expose an LLM financial write tool or permit correcting/reallocating an already recorded expense. Existing direct handover behavior remains available.

## Observed local checks (2026-10-19)

Build, type-check and lint passed. The runnable isolated demo posted the fictional KRW 50000 bill and a KRW 10000 partial repayment. Disposable manual checks (not a retained test suite) also observed:

- One KRW 50000 debit, personal expense 15000, receivables 21000 + 14000, and no additional cash debit or income; original Simulated provenance retained after confirmation.
- Exact response replay; same-key changed-payload conflict; different-key split and receipt duplicate rejection. Concurrent identical requests both returned 200 with one posting ID. Concurrent different-key requests returned 200/409 with one debit and two receivables.
- Allocation mismatch, duplicate/payer debtor identifiers, non-integer/negative/zero/unsafe bill amounts, unsupported currency, zero debtor share and missing confirmation rejected without any row changes. Zero payer share and a sole payer were accepted.
- Other-payer, cross-currency with an indicative rate and linking requests rejected without writes. A forced late allocation-insert failure rolled back the earlier balance, Activity, ledger, allocation and receivable changes.
- A historical MYR 250000-sen payment left 152133 sen in MYR Funding, returned Below reserve and was accepted. Insufficient tracked KRW funds returned RECONCILIATION_REQUIRED without writes.
- Partial then full repayment of a new KRW 21000 receivable credited the receiving account, preserved the original amount, cleared the debt, and created settlement entries only. Over-settlement rolled back; personal expense/gross totals were unchanged by repayments.
- Existing Home reads, plan read/preview and scripted Agent balance chat still worked; chat changed no financial records. This was the explicit demo adapter, with no real Groq call.
- Applying the new migration after seeding an old-schema disposable database preserved every existing row, including a pending plan and Agent session. Applying it to the configured local database likewise preserved hashes of every pre-existing row: 3 accounts, 6 activities, 9 entries, 1 receivable and 2 settlements. No shared-expense/demo postings were made there.

Live Steve integration, frontend confirmation and real Groq behavior remain unverified.

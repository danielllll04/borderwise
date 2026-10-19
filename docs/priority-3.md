# Priority 3 API handoff

This backend records activity completed elsewhere. No endpoint initiates a financial transfer, exchange, purchase or withdrawal. No frontend is included. Authentication is still absent: use loopback and the seeded demo profile only. Priority 5 now provides a read/preview Agent; see [its separate handoff](agent.md).

[Pending-plan risk reassessment](pending-plan-risk.md) is available separately through `GET /api/plans/assessments`, Home and an Agent read tool. It preserves saved Plan.status, reserve_breached, quotes and acknowledgement snapshots. A successful completion adds `pending_plan_follow_up` directing the frontend to a separate GET; optional assessment failure cannot misreport or undo that financial posting. Insufficient-funds forecasts do not weaken completion validation.

Run `npm run db:generate` after pulling schema changes, then `npm run db:migrate`, `npm run db:seed` and `npm run dev`. The second migration adds PlanRecord/WorkflowRequest without changing existing money or ledger rows. For a running local API, `npm run demo:plans` demonstrates the happy path with fictional inputs; each invocation creates new plans. It stops at a reserve warning unless the operator explicitly sets `DEMO_ACKNOWLEDGE_RESERVE=true`. Set `DEMO_BASE_URL` to change its loopback URL.

## Adapter assumptions and supported objectives

Priority 3 preserves the shared Plan, Quote, Money, Badge, RateSnapshot and LedgerEntry fields. The later confirmed Split handover proposes the additive `shared_expense` ledger type (see [handover](shared-expenses.md)); plan objectives remain unchanged. Additional fields below live in request/response wrappers or internal database metadata.

`src/integrations/compare-adapter.ts` is a small provisional mapping, not Compare's pricing engine:

- Shared `quote.objective` stays a free-text string. This adapter recognizes `exchange` and `atm_withdrawal` only. `mode` and `provider` stay nonempty free text; no new shared enums are introduced.
- `quote.funding_source` currently maps to `myr_funding`, `krw_card` or `krw_cash`. Context separately supplies the destination account. Exchange requires different currencies and owned accounts; ATM requires MYR Funding/KRW Card → KRW Cash. Same-currency ATM principal and received amounts must match, with fees separate.
- `context.fee_accounts` supplies one account per fee, in quote order. If omitted, all fees debit the funding account. Fee/account currencies must match. Mixed-currency fees need explicit accounts; never sum unlike currencies.
- `quote.total_debit` is the principal plus fees separately debited from the **funding account**, in that account's currency. Fees charged to other accounts appear separately in `account_impacts`. An inconsistent total is rejected.
- The adapter treats `quote.net_received` as the destination credit, with listed fees representing additional, separate account debits. If a provider has already withheld a fee from that amount, Compare must supply a compatible quote/fee breakdown before using this adapter; do not count the fee a second time. Confirm these semantics with Steve.
- `context.fee_behavior` is internal metadata: `fixed`, `percentage`, `tiered` or `unspecified` (default). It is a statement from Compare/caller, not inferred from amounts. SafePrincipal is calculated only for a MYR-funded principal with all fees fixed, in MYR and paid by MYR Funding. Zero fixed fees are allowed. Mixed-currency, variable or unspecified fees require a revised quote.
- Quote/rate badge source remains optional in the shared model. At this boundary, an absent source receives a fallback explaining that the source was unspecified. That validated snapshot, including all original financial values, becomes immutable at save time.
- Quotes need a positive decimal-string rate, but this service never calculates actual money from it. Actual rate snapshots retain their supplied provenance separately.

**Unsupported:** card purchases, income plans, settlement plans and arbitrary objectives. Card purchases must not credit an owned destination account. The shared ledger has no purchase type, so requests return `UNSUPPORTED_OBJECTIVE` (422) until the contract is agreed. Existing Priority 1 income/settlement services remain available internally.

## Modal A: preview a selected quote

`POST /api/plans/preview`, with this body directly (not inside `selection`):

```json
{
  "quote": {
    "quote_id": "compare-selected-001",
    "objective": "exchange",
    "mode": "manual-recording",
    "funding_source": "myr_funding",
    "provider": "Fictional provider",
    "rate": "298",
    "principal": { "amount_minor": 10000, "currency": "MYR" },
    "fees": [{ "label": "Fixed provider fee", "Money": { "amount_minor": 100, "currency": "MYR" } }],
    "total_debit": { "amount_minor": 10100, "currency": "MYR" },
    "net_received": { "amount_minor": 29800, "currency": "KRW" },
    "badge": { "status": "Simulated", "source": "Local Compare fixture", "timestamp": "2026-10-18T00:00:00.000Z" }
  },
  "context": {
    "destination_account": "krw_card",
    "fee_accounts": ["myr_funding"],
    "fee_behavior": "fixed"
  }
}
```

The complete response includes `checked_at`, opaque `check_token`, funding/destination account IDs, badged `current_balance`, `principal`, each `fee`, `total_debit`, `amount_received`, `projected_balance`, `total_reserve`, `projected_reserve_shortfall`, `requires_reserve_acknowledgement`, `reserve_check`, `other_account_reserve_check`, `safe_principal` and `account_impacts` for every touched account. Monetary values use `{ Money, badge }`. For example, **an excerpt** with a fresh Priority 1 seed is:

```json
{
  "current_balance": {
    "Money": { "amount_minor": 402133, "currency": "MYR" },
    "badge": { "status": "Simulated", "source": "Previous MYR Funding balance + signed ledger lines for seed activity", "timestamp": "2026-10-18T08:00:00.000Z" }
  },
  "projected_balance": {
    "Money": { "amount_minor": 392033, "currency": "MYR" },
    "badge": { "status": "Simulated", "source": "Current funding balance + projected signed principal and separate fee lines", "timestamp": "2026-10-18T08:00:01.000Z" }
  },
  "requires_reserve_acknowledgement": false,
  "safe_principal": {
    "status": "available",
    "amount": {
      "Money": { "amount_minor": 202033, "currency": "MYR" },
      "badge": { "status": "Simulated", "source": "max(0, MaxSafeTotalDebit - sum of fixed MYR quote fees)", "timestamp": "2026-10-18T08:00:01.000Z" }
    },
    "reason": "Request a revised quote from Compare for this principal; no quote fields have been changed.",
    "revised_quote_required_to_change_principal": true
  }
}
```

The shared budget service computes TotalReserve, MaxSafeTotalDebit and the signed differences in integer minor units. SafePrincipal is `max(0, MaxSafeTotalDebit - fixed MYR QuoteFee)`. If fees consume all safe debit, `safe_principal.status` is `no_positive_principal` with zero and an explanation. With variable/mixed/unspecified fees it is `revised_quote_required` and `amount: null`.

For KRW-funded principal, `reserve_check.applicability` is `not_applicable` and MYR reserve values are null; sufficient-funds checks still apply. If an explicit fee is separately paid from MYR Funding, `other_account_reserve_check` independently describes **that MYR account's** reserve impact and can require acknowledgement. MYR reserves are never subtracted from KRW accounts. Projected balances must remain nonnegative on every account after all principal and fee movements; insufficient funds is a blocking 409, never an acknowledgeable warning. Fees may be paid from the destination's projected credit, matching Priority 1 accounting.

Preview does not insert plans or write any database state. Multiple pending plans do not earmark money: every preview/save checks current **actual** balances, without subtracting other plans.

## Acknowledge and save pending

`POST /api/plans`:

```json
{
  "selection": { "quote": "<full quote object above>", "context": "<full context object above>" },
  "idempotency_key": "client-generated-save-key-001"
}
```

The quoted placeholders above describe object reuse; send actual JSON objects, not strings. With a reserve warning, add:

```json
{
  "reserve_acknowledgement": {
    "acknowledged": true,
    "check_token": "<64-character token from the current Modal A preview>"
  }
}
```

The server revalidates the quote, current balances and reserves inside the save transaction. It does not accept a client `reserve_breached` flag. If a debit projects below reserve, a matching acknowledgement is mandatory; a previous preview alone is insufficient.

Response wrapper:

```text
{
  plan: { plan_id, quote, status: "pending", reserve_breached },
  context,
  created_at, updated_at, cancelled_at: null,
  checks: { saved: <Modal A checked values>, completion: null },
  completion: null
}
```

`plan` is exactly the shared Plan model. The backend stores an immutable quote/context snapshot plus checked amounts, their input provenance, any acknowledgement and its server timestamp. **No balances, ledger entries or reserved-funds records change.** Pending `reserve_breached` records the acknowledged breach at save time; it is a historical result, not a continuously recalculated flag.

For a safe amount, ask Compare for a **new complete Quote** using the suggested principal (or a revised affordable quote when no fixed-fee suggestion is possible). Submit that new quote through preview/save. This backend never edits principal while retaining old `net_received`, fees or `total_debit`, and does not expose a comparison engine endpoint. See `src/integrations/compare-fixture.ts` for a fixture.

## List, read, not completed yet and cancellation

- `GET /api/plans?status=pending&limit=20&cursor=<plan UUID>`: status is optional (`pending`, `completed`, `cancelled`); default limit 20, max 100. Returns `{ items: <plan wrappers>, next_cursor }`. Entries sort by creation timestamp and UUID descending. Use the returned last ID as an exclusive cursor, or null when exhausted. If a status-filtered cursor's plan changes status, restart pagination; it returns `INVALID_CURSOR`.
- `GET /api/plans/:planId`: current shared Plan and separate workflow metadata. Historical saved/completion checks retain their original values, not today's balances.
- **Not completed yet:** close Modal B or read the plan. No mutation request exists or is needed; the plan stays pending and financial state stays unchanged.
- `POST /api/plans/:planId/cancel`, with `{}` (or no body): changes a pending plan to cancelled, storing the cancellation time. Repeated cancellation returns the same result. It never posts/reverses ledger activity.
- Completed plans cannot be cancelled or confirmed with a new key. Cancelled plans cannot be completed. `PLAN_NOT_PENDING` returns 409. There is no plan editing, reopening or deletion endpoint.

## Modal B: actual completion preview

`POST /api/plans/:planId/completion-preview`:

```json
{
  "actual": {
    "activity_type": "exchange",
    "funding_account": "myr_funding",
    "destination_account": "krw_card",
    "principal": { "amount_minor": 10200, "currency": "MYR" },
    "amount_received": { "amount_minor": 30100, "currency": "KRW" },
    "fees": [{
      "label": "Actual provider fee", "account_id": "myr_funding",
      "Money": { "amount_minor": 120, "currency": "MYR" }
    }],
    "rate_snapshot": {
      "pair": "MYR/KRW", "rate": "295.0980392156862745",
      "badge": { "status": "User-Confirmed", "source": "Rate reported on completed activity receipt", "timestamp": "2026-10-18T08:00:00.000Z" }
    },
    "completed_at": "2026-10-18T08:00:00.000Z"
  }
}
```

`rate_snapshot` is optional; no money is calculated from it. The typed internal `ActualActivity` discriminates `exchange` and `atm_withdrawal`, not new shared objective enums. For ATM, set `activity_type: "atm_withdrawal"`, funding to MYR Funding/KRW Card and destination to KRW Cash. Actual principal, credit, fees, currencies and accounts are independently validated by the existing ledger rules. The activity type must match the saved quote; actual account changes are allowed if valid for that type and are shown as differences.

Completion principal/received/fee provenance is generated as `User-Confirmed`, with the supplied timezone-qualified completion timestamp and a source stating this was reported as completed elsewhere. The original quote and any indicative/simulated rate snapshot retain their own badges. Derived results include persisted balance/reserve input badges, so simulated/indicative provenance is never promoted to Live.

The response contains the same account/reserve impact fields as Modal A plus `differences`: quoted and actual principal, funding-account total debit and received amounts, signed differences when currencies match (`null` when they differ), quoted/actual fee lists with accounts and a `changed` flag, changed funding/destination accounts, quoted rate and optional actual rate snapshot. For the example, principal increases by 200 sen, total debit by 220 sen and received value by 300 won. SafePrincipal recommendations are not applied to already-completed facts.

This endpoint is read-only. Insufficient funds, a currency mismatch or another invalid actual amount blocks it. It may return a new reserve warning even if the saved plan was within reserves.

## Confirm and record exactly once

`POST /api/plans/:planId/confirm`:

```text
{
  actual: <exact full actual object reviewed in Modal B>,
  confirmed: true,
  idempotency_key: "client-generated-completion-key-001",
  reserve_acknowledgement: { acknowledged: true, check_token: <Modal B token> }
}
```

Omit `reserve_acknowledgement` when no warning applies. `confirmed: true` is required; a false/missing flag is rejected. The actual amounts and timestamp must be repeated exactly on retry.

Inside one database transaction, the service reads the pending plan, projects/validates **actual** ledger lines against current account balances and reserves, validates any acknowledgement, claims the pending plan, posts through `LedgerService.postInTransaction`, stores completion metadata/linked IDs and the idempotent response, then commits. No nested transaction or second accounting implementation is used. A failure at any point rolls back balances, principal and fee entries, plan status, metadata and replay record. The plan remains pending.

The response contains the current plan wrapper plus `posting: { activity_id, entries, balances }`. Each fee is a separate `fee` entry in the same activity group. `completion` contains actual input, its badge, user completion timestamp, server recording timestamp, activity ID and ledger entry IDs. The original shared `plan.quote` never changes. Completed `reserve_breached` reflects the reserve result for the actual posting; saved checks and acknowledgements remain internally retained for audit. A cancelled plan retains its saved breach flag.

## Stale checks, acknowledgement and replay

The opaque `check_token` hashes the stage, selected quote/actual payload, touched account balances and their provenance, and applicable current reserve values/provenance. It is a change-detection token, not authentication. Previews are stateless and tokens are not stored until a save/completion records its check. Save and completion tokens are deliberately different. Acknowledging quoted amounts does not authorize a larger actual debit, changed fees, another funding account or changed reserves/balances.

If a reserve warning requires acknowledgement, echo that preview's token with `acknowledged: true`. The operation recomputes the check. `RESERVE_ACKNOWLEDGEMENT_REQUIRED` means review and acknowledge the warning; `STALE_RESERVE_CHECK` means refresh/review and acknowledge the changed check. Both are 409 with `error.details.preview` containing current values/token. An operation within reserves can proceed without a token after its own fresh validation. Insufficient funds cannot be bypassed by acknowledgement.

Idempotency keys are nonempty strings up to 200 characters. Creation keys are scoped to `create-plan`; confirmation keys are scoped to `confirm-plan` across all plans (the hashed payload includes the plan ID). Existing ledger idempotency remains separate. Validated JSON uses the same canonical hashing helper as Priority 1: object key order is ignored, array order is retained and schema defaults are normalized.

- Same operation/key/payload returns the original response, including original IDs, metadata and posted balances. A creation replay can show the original pending result after the plan was later completed; read the plan for current status. A confirmation replay succeeds after completion without posting again.
- Same operation/key with a different payload returns `IDEMPOTENCY_CONFLICT` (409). Keep timestamps and acknowledgement tokens unchanged on a network retry. After an explicit stale-check rejection, no success record was stored; resubmit the updated acknowledgement with that key or a new key.
- Different confirmation keys cannot post the same plan twice: the pending-status claim and a unique linked completion activity protect the plan, and ledger activity uses a deterministic per-plan key. Losers receive `PLAN_NOT_PENDING`, or a retryable `DATABASE_BUSY` (503) while SQLite contention resolves. Retry 503 using the same key/payload.
- There is no success replay record after validation/accounting failure. Read/preview again before making a new decision. A genuine successful retry always replays before checking the now-completed plan's status.

All errors keep the existing `{ error: { code, message, details?, request_id } }` envelope. Other useful codes: `INCONSISTENT_QUOTE_TOTAL` (422), `CURRENCY_MISMATCH` (422), `ACTIVITY_TYPE_MISMATCH` (422), `INSUFFICIENT_FUNDS` (409) and `PLAN_NOT_FOUND` (404).

## Remaining integration work / Priority 5

Steve should confirm objective/funding-source mapping, account-debited versus withheld quote fees, `net_received` semantics and fixed-fee assertions. Existing signed-ledger, decimal-string rate and mixed-provenance questions remain open. Tze Loon can use the endpoints and JSON fixture now without a comparison engine; a real revised quote must come from Compare. Card purchases require a shared ledger agreement before enabling them.

HomeService and PlanService now support the separate read/preview Agent through narrow capabilities. Agent proposals require an explicit frontend Save route, which reuses this plan service with an additional expected-preview-token check inside its save transaction. Existing Priority 3 endpoints retain their behavior. The Agent cannot confirm or cancel activity, update reserves or post the ledger. No frontend, bank integration or tests are included.

# Deterministic pending-plan risk

The [connected Home frontend](home-integration.md) now displays these independent forecasts separately from the actual current MYR budget. Completion/cancellation refresh the existing read APIs; a read failure cannot turn a committed completion into a failed payment. Saved quote warnings remain explicitly historical.

Current risk is a read response, separate from saved Plan.status, Plan.reserve_breached, quote snapshots and historical acknowledgements. `PendingPlanRiskService` evaluates **pending** plans on demand against recorded account balances and reserves. It neither reserves funds nor writes assessment records, plans, accounts or ledger entries. Completed/cancelled plans are excluded. No migration, background task or cache is required.

The service reuses `quoteActivity`, Priority 3 `assessActivity`, ledger projection and existing budget arithmetic. A read-only projection can describe a negative result; the existing prepare/post path still rejects negative balances. The saved quote's amounts, source badge and timestamp are preserved. The quote remains a historical quote, not proof that an offer is still available.

## Read endpoint and response

`GET /api/plans/assessments?limit=20&cursor=<plan_uuid>` returns newest first, with `limit` 1–100 and the existing created_at/ID cursor convention. Cursor ownership is checked. A cursor can still identify a plan that was completed/cancelled between reads; only remaining pending plans appear. Each page is a fresh snapshot; this is not a frozen multi-page export.

```text
{
  status: "available",
  assessed_at: <ISO timestamp>,
  financial_context_fingerprint: <SHA-256>,
  assessment_scope: "individual_plan",
  notice: <independent-plan / receivables-excluded explanation>,
  actual_current_budget: <existing MYR budget DTO>,
  items: [{
    plan_id, plan_status: "pending",
    state: "Within reserve" | "Would breach reserve" |
           "Insufficient tracked funds" | "Reserve check not applicable" | "Cannot assess",
    reason: { code, message },
    assessed_at, financial_context_fingerprint, plan_snapshot_fingerprint,
    quote: { quote_id, badge } | null,
    funding_account: <resolved stable account ID> | null,
    affordability: "sufficient" | "insufficient" | "unknown",
    acknowledgement_cannot_override_insufficient_funds: true,
    projected_deficits: [{ account_id, deficit: { Money, badge } }],
    preview: <Priority 3 projection DTO> | null,
    assessment_scope: "individual_plan"
  }],
  next_cursor: <plan UUID> | null
}
```

`PendingPlanAssessment` is exported from `src/services/pending-plan-risk.ts`; it is a backend response wrapper, not a shared Plan contract change. The financial fingerprint covers the recorded accounts/currencies/balance provenance and reserve amounts/provenance in that transaction. Each item separately fingerprints its immutable stored quote/routing. Fingerprints are comparison tokens, not authorization or a promise of affordability. Unrelated account changes can change the batch fingerprint without changing a particular plan's risk. No claim of newly caused/worsened risk is made.

Example excerpt from the isolated verification (amounts below are **MYR sen**, not ringgit):

```json
{
  "state": "Would breach reserve",
  "funding_account": "myr_funding",
  "affordability": "sufficient",
  "projected_deficits": [],
  "preview_excerpt": {
    "current_balance": { "amount_minor": 332133, "currency": "MYR" },
    "total_debit": { "amount_minor": 151000, "currency": "MYR" },
    "projected_balance": { "amount_minor": 181133, "currency": "MYR" },
    "projected_reserve_shortfall": { "amount_minor": 18867, "currency": "MYR" }
  }
}
```

This is an abbreviated illustration; the actual preview retains Priority 3 `{ Money, badge }` wrappers. For insufficient funds, an observed separate example projected a **68867-sen account deficit** and **268867-sen reserve shortfall**. These are different quantities; acknowledgement cannot make the posting affordable. Insufficient tracked funds takes precedence over reserve-risk state, including when a fee account rather than the principal funding account would go negative.

Unsupported objectives, invalid/incomplete quote/routing data, inconsistent fee/debit totals and unsupported currency combinations return an item-level `Cannot assess` with a safe reason and no invented projection. Existing adapter rules define principal plus separate funding-account fees, with explicitly routed other-account fees kept separate. Missing fee-account context means the existing documented funding-account default, never a guessed different account. `fee_behavior=unspecified` does not prevent projecting a complete stored debit, but safe-principal advice remains `revised_quote_required`; fixed/percentage/tiered behavior is never inferred from amounts. Unknown debit/fee semantics must be resolved in a complete compatible quote, not approximated here.

## Home additions and account boundaries

GET `/api/home` preserves `profile`, `balances`, actual `budget` and `shared_expense_totals`. It adds:

```text
pending_plan_risk: {
  status: "available", assessed_at, financial_context_fingerprint,
  assessment_scope: "individual_plan", notice,
  actual_current_budget,
  pending_count,
  risk_counts: {
    "Within reserve": <count>, "Would breach reserve": <count>,
    "Insufficient tracked funds": <count>, "Reserve check not applicable": <count>,
    "Cannot assess": <count>
  },
  cards: [<PendingPlanAssessment, maximum 3>],
  cards_limit: 3, more_risk_cards: <boolean>
}
```

Counts cover all current pending plans. Cards prioritize insufficient funds, then projected reserve risk, then cannot-assess; they are a bounded subset, not a paginated list. Read the paginated endpoint for the full set. An actual budget can be Above reserve while individual plans Would breach reserve. The current shortfall stays in `budget.reserve_shortfall`; forecast shortfalls live in individual projections. Render these separately.

MYR reserves apply only to MYR Funding. KRW-funded principal gets `preview.reserve_check.applicability = "not_applicable"`; if all debits are KRW, the plan state is `Reserve check not applicable` after a successful funds check. A KRW Cash bill does not create a MYR reserve debit or convert its amount into MYR. Existing Priority 3 supports explicitly paid MYR fees on a KRW-funded plan: any such fee retains a separate `other_account_reserve_check`, and only that actual MYR debit can produce a MYR reserve risk. No exchange rates or combined MYR/KRW balances are invented.

Each plan sees the same recorded funds, independently of other pending plans. A batch does not subtract one plan before evaluating the next. Outstanding receivables are excluded entirely. This is **not** a combined multi-plan forecast, funds reservation, quote refresh or guarantee all pending plans can be executed together.

Profile, accounts and the plan page are read in one transaction. There are no per-plan database queries: plans are projected against the shared in-memory financial snapshot. Home reuses its own transaction's profile/accounts and performs one pending-plan query for all counts/cards. Financial or reserve changes are reflected at the next read without cache invalidation.

## Post-action refresh and failures

Successful shared-expense and settlement posting results add static `pending_plan_follow_up`. Plan completion adds it at the top level:

```json
{
  "pending_plan_follow_up": {
    "status": "refresh_required",
    "method": "GET",
    "url": "/api/plans/assessments",
    "financial_action_succeeded": true,
    "retry_financial_action": false
  }
}
```

No optional assessment runs inside or after a posting before its success is returned. The financial transaction commits independently, and the frontend performs the documented separate read. Replay responses remain original snapshots and carry the same read instruction; older stored replay results may lack this additive field, so refresh after any successful legacy response too. The existing settlement service remains internal; no new settlement write endpoint is added.

If the read fails, HTTP 503 uses the existing error envelope with code `PENDING_PLAN_ASSESSMENTS_UNAVAILABLE`. `error.details` contains `{ status: "unavailable", assessed_at, reason, refresh: { method: "GET", url: "/api/plans/assessments" }, retry_financial_action: false, assessment_scope, notice }`. Home handles an optional risk failure by returning its actual budget/balances and `pending_plan_risk.status = "unavailable"` with the same refresh instruction. Do not display unavailable as zero risk.

Frontend sequence:

```typescript
const posting = await confirmSharedExpense(reviewedPayload); // Existing explicit confirmation.
showPostingSuccess(posting); // Financial result remains successful regardless of the next read.
try {
  const assessments = await get('/api/plans/assessments?limit=20');
  renderIndividualRiskCards(assessments);
} catch {
  showRiskRefreshUnavailable(); // Retry this GET only; do not blindly repeat the payment action.
}
```

The same follow-up applies after explicit plan completion or an internal settlement. Saving/cancelling a plan and editing reserves should also refresh Home or assessments. Without a proven before/after comparison, use “This pending plan currently risks your reserve.” No action attribution is stored or inferred.

## Agent read tool and frontend actions

The one new tool is `read_pending_plan_risks({ limit?: 1..5, cursor?: <owned plan UUID> })`, default limit 3. It returns the same service result in an authoritative `AgentCard` variant `{ type: "pending_plan_risk", data: <assessment page or unavailable state> }`. Only plan IDs/states/read status go back to the model; money remains on service-rendered cards. The scripted adapter recognizes prompts such as “Review my pending plan risks”.

The Agent explains current risk and offers to review supported options. It cannot silently change/cancel a plan, modify its quote or record an acknowledgement. Proposal Save and completion remain the separate explicit frontend flows. Cards/history carry assessment timestamps; historical cards are snapshots, so request a new read to refresh them. Real Groq testing remains on hold. This assessment service adds no financial write tools, Steve services or frontend screens.

The later [receipt review integration](receipt-review.md) adds metadata-only receipt/assignment tools and a separate frontend confirmation route. After that route succeeds, reuse this same risk read/tool; no receipt-specific forecast or causal claim is introduced. It still cannot modify/cancel plans or post through chat.

## Observed local verification (2026-10-19)

Disposable manual checks used a freshly migrated/seeded temporary SQLite database, then removed it; no test suite was retained. They observed:

- Two MYR plans individually Within reserve against the same funds despite their combined debits exceeding available-above-reserve. Quote badge/timestamp, shared batch timestamp and financial fingerprint were preserved.
- A KRW Cash shared bill left the MYR plan's projected amounts/state unchanged. A MYR 70000-sen shared bill changed its assessment from safe to risk with an 18867-sen forecast shortfall while the actual budget stayed Above reserve. Saved `reserve_breached` remained false.
- A relevant MYR 50000-sen repayment restored safe status. Reserve edits changed current assessments immediately; KRW-only funding stayed reserve N/A.
- Unsupported objective, inconsistent total, incomplete routing and invalid JSON returned Cannot assess. Unspecified fee behavior produced no guessed safe principal.
- Pagination had no repeated plan IDs; assessing 1 versus many plans used the same **3 SELECT queries** without a cursor. Read endpoints/Home left hashes of all financial records, plans and acknowledgements unchanged.
- A 68867-sen projected deficit was separate from a 268867-sen reserve shortfall. Outstanding debt was excluded, and Priority 3 still rejected an unaffordable posting even with acknowledgement supplied.
- An explicit MYR fee on a sufficiently funded KRW principal correctly reported that fee account's separate deficit; the KRW principal's reserve check remained not applicable.
- Injected assessment failure did not undo or misreport shared-expense posting, settlement or completion. The follow-up read returned a clear unavailable state; Home retained actual balances/budget. Completed/cancelled plans were excluded from active pages/counts/cards.
- Scripted Agent risk cards and existing comparison/proposal chat worked with no financial mutations. The configured database's full row hashes remained unchanged. No real Groq call was made.

Remaining integration: render these Home/Agent wrappers, paginate reads, refresh after explicit actions, and distinguish actual shortfall, individual plan forecasts and unavailable assessments. Live Compare/Split integration and real Groq verification remain separate work.

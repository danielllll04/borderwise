# Split repayments: Node authority and frontend contract

Implemented on `codex/steve-compare`, 20 October 2026. Node is the sole financial writer and source of outstanding debt. Steve owns allocation calculations; Python's standalone receivable store and bridge events are not financial inputs to this workflow. No database migration, dependency upgrade or shared financial model change is required.

## Read authoritative debt

| Node endpoint | Purpose |
| --- | --- |
| `GET /api/receivables` | Current owned debts; `status=outstanding` (default), `settled` or `all`; optional `participant_id`, `split_id`, `receipt_id`; `limit=1..100` (default 20) and `cursor` |
| `GET /api/receivables/:receivableId` | One owned authoritative debt |
| `GET /api/receivables/:receivableId/settlements` | Recorded repayments, newest first; `limit=1..100` (default 20) and settlement UUID `cursor` |
| `POST /api/receivables/:receivableId/settlements/confirm` | Explicit user-confirmed repayment only |

Lists return `items` and `next_cursor`, null when exhausted. Debt pagination uses ascending receivable ID; history uses descending recording time and ID. Cursors must belong to the profile/filter or receivable; if the list changes and a cursor no longer matches, refresh the list. Fetch history separately rather than treating an embedded old card as current state.

The debt wrapper has `authority: "node_ledger"`, the unchanged shared `receivable`, stable `participant_id`, `split_id`, `receipt_id`, `shared_expense_id`, `identity_link`, `original_amount`, `cleared_amount`, `outstanding_amount`, `status` (`open`, `partial`, `settled`), provenance and `settlement_history_url`. Money remains integer minor units. The shared `Receivable.amount` and `original_amount` always retain the original debt and currency. Outstanding is original minus committed clearance in that currency, never a conversion of cash received. The original debt badge remains intact; repayment provenance is in history.

| Identity | Authoritative source |
| --- | --- |
| Receivable | Node-generated `receivable.receivable_id` returned after confirmed bill posting |
| Participant | `SharedExpenseAllocation.participantId`, supplied as a stable reviewed directory ID |
| Split / receipt | Bound Node `SharedExpense.splitId` / `receiptId`; the preview split reference identifies the reviewed allocation |
| Settlement / ledger | Node settlement/activity/entry IDs returned by confirmation and history |
| Legacy unlinked debt | Link fields are null and `identity_link=legacy_unlinked`; no display-name or Python-UUID matching |

Two participants can share a display name. Store and submit Node IDs; never infer identity from `debtor`, a name or a Python in-memory UUID. Unknown/foreign debt reads and confirmations return 404. Account ownership is checked by the posting service. Current identity remains the existing fixed local demo profile, not authentication; production identity/authorization is still required before deployment.

## Explicit frontend confirmation

After showing current outstanding debt and collecting actual repayment facts, submit this payload to the Node receivable's confirmation URL:

```json
{
  "frontend_action": "confirm_repayment",
  "confirmed": true,
  "idempotency_key": "repayment-ui-unique-stable-key",
  "amount_cleared": { "amount_minor": 15000, "currency": "KRW" },
  "amount_received": { "amount_minor": 4850, "currency": "MYR" },
  "receiving_account": "myr_funding",
  "received_at": "2026-10-20T00:10:00Z",
  "provenance": { "source": "User checked the actual repayment in their bank app" }
}
```

The explicit action/boolean is an application protocol, not authenticated proof of a click. `received_at` is an ISO timestamp with timezone. Source is nonempty, at most 600 characters. Retry key is nonempty, at most 150 characters. Positive safe-integer amounts are mandatory. All objects are strict: arbitrary profile, posting kind, badge, FX rate or fee fields are rejected. No settlement tool is registered with the LLM.

`amount_cleared` reduces original-currency debt; `amount_received` independently credits the owned receiving account in its currency. Account IDs are `myr_funding` (MYR), `krw_card` (KRW), `krw_cash` (KRW). Same-currency principal amounts must match. Cross-currency amounts must both be entered explicitly; the server never infers actual repayment from indicative FX. The narrow frontend endpoint currently accepts no fees or FX snapshots. The internal ledger's existing fee/snapshot support is not exposed here; a fee-bearing repayment needs an agreed explicit contract rather than silently changing principal.

For the example, outstanding KRW 15,000 becomes zero and MYR Funding increases by 4,850 sen. The bill is not debited again, and no income entry is created. Partial repayments preserve the original debt. Over-settlement rolls back. A receivable compare-and-swap and the existing atomic ledger transaction protect different request keys and different receiving accounts against clearing more than remains.

Node stamps separate `User-Confirmed` repayment provenance from the actual source/time; this does not relabel a Simulated original bill or balance as Live. Original receipt provenance and confirmations remain separate.

## Response, replay and recovery

Success returns the existing posting result (`activity_id`, `entries`, `balances`, `settlement`, `pending_plan_follow_up`) plus `financial_action_succeeded: true`, `settlement_id`, `recorded_at`, `confirmation`, `ledger_entry_ids`, `receivable_at_posting` and `current_state`.

- `settlement` includes independently badged cleared/received/remaining amounts and original shared receivable. The durable activity result includes settlement ID, recording time and confirmation audit metadata.
- `receivable_at_posting` and posting balances describe that committed operation. Replaying the same key/body returns that operation, even if another repayment happened later.
- `current_state.status=available` includes a fresh authoritative debt wrapper and balances; it may reflect later operations. It is an optional post-commit read.
- If that read fails, financial success remains success, with `current_state.status=unavailable`, `read_url`, `balances_url` and `retry_financial_action: false`. Refresh those reads and the existing `pending_plan_follow_up` instruction; do not create a new repayment key because a refresh failed. Assessments never modify plans or reserve funds.

Keep the exact key and payload for a network retry. Keys are namespaced to the repayment operation/current profile and hashed internally; reusing a key for a changed debt, amount, account, timestamp or source returns `IDEMPOTENCY_CONFLICT` (409). Different keys are independent operations, still bounded by current outstanding debt. A 503 database-contention response may be retried with the same key/body. A 409 over-settlement requires refreshing the debt and asking the user to review a new amount. Validation is 400, accounting/currency mismatch 422, unknown/foreign records 404. There is no unrestricted POST ledger route.

History returns settlement/activity/receivable IDs, both actual Money inputs, receiving account, `received_at`, `recorded_at`, provenance, confirmation, optional legacy rate snapshot, fees and ledger entry IDs. Older internal settlements without confirmation retain `confirmation: null` and `received_at: null`; their database recording time is not invented as the actual receipt time.

## Steve/frontend ownership and prohibited legacy routes

Steve's integrated Split views should use the Node reads above through the same-origin backend/reverse proxy, retain returned Node IDs, and send explicit confirmation to Node. No Python write or second state update is required after Node succeeds. Frontend wiring/screens and deployment proxy/authentication remain integration work; this step adds only the backend contract.

| Python route/event | Integrated frontend rule |
| --- | --- |
| `GET /api/split/receivables` | Do not use for authoritative outstanding debt. It reads an independent process-local legacy store and is marked deprecated. Use Node reads. |
| `POST /api/split/receivables/{receivable_id}/settle` | Do not call in the integrated workflow. Deprecated standalone legacy write: flips the whole local settled flag before callback, lacks partial-clearance and durable Node confirmation semantics. |
| `POST /api/split/allocate` | Do not call for receipt review; it creates Python receivables/events. Use pure `/api/split/allocate/preview`, then explicit Node bill confirmation. |
| `GET /api/split/daniel-bridge-logs` | Deprecated diagnostics only. Never poll/replay these events into the Node ledger. |
| `shared_expense_paid` / settlement bridge callback | Never install a financial writer callback, debit the bill again or mirror a Python settled flag into Node. |

Legacy Python bodies and standalone behavior remain backward compatible and clearly separated. Allocation preview remains pure. No bridge consumer or callback is installed. Python events lack trusted Node identity/confirmation and are rejected by the strict confirmation contract. A future Python view proxy may delegate reads to Node, but must not introduce a second debt store or dual-write synchronization.

## Observed isolated verification

On 20 October 2026, separate Node and Python processes used disposable SQLite with existing migrations/fictional seed and private temporary receipt uploads. Configured Supabase was not opened or changed. Hashes confirmed `.env`, existing SQLite/sidecars and local receipts were unchanged; temporary databases/storage/processes were removed.

| Scenario | Observed |
| --- | --- |
| Reads / identity / history | Passed stable IDs despite identical names, legacy null linkage/time, ownership, bounded pagination and status filters; reads caused no financial writes. |
| Cross-currency example | Passed KRW 15,000 cleared / MYR 4,850 sen received; exact account credit, no income or repeat bill debit; response included ledger references and refresh instruction. |
| Same-currency partial/full | Passed KRW 4,000 then 6,000 against KRW 10,000; original amount preserved. Earlier replay kept its original snapshot while current state showed full clearance. |
| Replay / concurrency | Same body/key replayed one activity; changed body conflicted. Concurrent 7,000 + 7,000 requests with different keys/accounts against 10,000 debt produced one posting and one rejection, not 14,000 clearance. |
| Invalid inputs | Unknown/foreign debt, unowned/invalid account, wrong currencies, mismatched same-currency principal, zero/fractional/excess amounts, missing confirmation and forged posting/rate fields rejected without posting. |
| Refresh outage | Fault-injected optional read failure after a real commit still returned financial success. Read recovery and exact replay created no second posting. |
| Pending plans | Actual repayment increased MYR funds; the relevant saved plan changed from `Would breach reserve` to `Within reserve`, with a changed assessment fingerprint. |
| Python separation | Actual legacy allocation/settlement mutated only isolated Python state/events; Node hashes stayed unchanged. Python UUID/bridge payload could not confirm Node repayment. Deprecated route metadata was present. |
| Regression | Actual HTTP Compare and receipt preview/confirmation worked; scripted Agent proposal and receipt orchestration worked. Chat caused no posting; no settlement write tool or unrestricted ledger POST existed. |

No new real-Groq inference was performed in this step; scripted Agent checks are not model verification. Prior actual Groq selections remain in [Groq verification](groq-verification.md). Steve OCR still returns an explicitly Simulated sample and Compare still uses seeded data. These checks demonstrate local SQLite behavior, not a new hosted-database/load/deployment guarantee.

Build, type-check, backend lint, existing isolated Split demo, Python dependency check and existing calculator/splitter checks passed. Full-root lint still reports 26 existing frontend errors; frontend checks were not disabled. Remaining work is frontend adoption, production identity/deployment validation and agreed fee support if required, not a second Python settlement writer.

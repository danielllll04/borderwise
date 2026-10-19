# Agent receipt review and split allocation

Steve's live OCR, receipt-review, allocation and Split endpoints are **not connected** to this backend. The preserved root `schemas.py` contains Python OCR/split models and `steve_calculator.py` contains comparison work; they are not wired into `src/receipts/contracts.ts`. Those TypeScript ports remain small **integration proposals**, not agreed replacements for Steve's contracts. Python uses receipt item names, integer quantities and KRW unit/line totals, friend names/home currencies, and uppercase paying-account IDs; the current review ports use stable participant IDs, decimal-string quantities, currency-tagged line totals, versions and assignment-bound proposals. These mappings and identity/version semantics still require agreement. No live URL, OCR engine or allocation algorithm has been invented. Live integration remains unverified. Later [real Groq smoke checks](groq-verification.md) exercised receipt orchestration with explicitly Simulated OCR/directory/allocation adapters; they do not verify image recognition or Steve's calculations.

The backend owns attachment/session boundaries, versioned review proposals, explicit confirmation, financial validation, ledger/balances/receivables and pending-plan assessments. Steve must supply OCR/review data, stable participant/receipt/split IDs and deterministic calculated shares. The Agent can propose assignments and persist review metadata; it has no financial posting tool.

## Local configuration and image uploads

The existing environment loader is reused. Receipt adapters default to unavailable, independently of the Agent provider. For explicitly simulated development in the PowerShell session starting the server:

```powershell
$env:AGENT_PROVIDER = 'demo'
$env:RECEIPT_PROVIDER = 'demo'
npm run db:generate
npm run db:migrate
npm run dev
```

This makes no Groq call and does not contact Steve. To return to unavailable receipt integration, clear the process override and set `RECEIPT_PROVIDER="unavailable"` in the ignored `.env`. No service credentials or endpoint URLs are needed for fixtures.

`POST /api/agent/sessions/:sessionId/attachments` accepts **raw** `image/jpeg` or `image/png` bytes. JSON bodies, paths, remote URLs and client filenames are not upload references. The route checks session/profile ownership, a 4 MiB input limit, matching binary signature, actual decoder format, decoded dimensions (1–4096 per side) and complete pixel decoding. The private stored copy is normalized to PNG, strips embedded metadata and must also fit 4 MiB. Sharp is pinned for decoding; Fastify was updated within version 5 to address reported request-validation advisories.

The response contains an opaque `attachment_id`, dimensions and expiry; it never exposes a filesystem path. Server-generated names live in `.local/receipts`, outside public/static/build directories and ignored by Git. Optional `RECEIPT_STORAGE_DIR` is **server-only configuration**, not a model/client argument, and cannot name public/static/dist paths. There is no public file-serving route. Receipt source text is untrusted data, not permission or instructions.

Images expire after 24 hours. A development session is limited to 20 active attachments (a development resource limit, not production abuse protection). `npm run receipts:cleanup` removes up to 100 expired images per run, marks them purged and retains review/financial audit metadata. It also scans up to 1000 server-named files for orphan images older than 24 hours left by a crash before metadata committed. It never recursively deletes arbitrary directories. Existing extracted drafts remain reviewable after image cleanup; an expired image cannot start a new extraction. Run maintenance manually; no scheduler/notification service is added.

Production authentication is still absent. Ownership checks use the seeded `demo-profile` and session IDs; these are local-development boundaries, not secure production multi-user authorization. Keep the loopback host. Production upload storage, authenticated access, privacy/retention policy, malware/resource controls and service credentials remain integration work.

## Proposed adapter contracts

The exported TypeScript ports are:

- `ReceiptOcrAdapter.extract({ attachment_id, bytes, content_type: 'image/png' })`: returns a validated `ReceiptExtraction` with stable `receipt_id`, merchant/date if available, item IDs/labels/positive quantity strings, line-total Money, tax, discount, original-currency total, original Badge, and optional confidence. Confidence is shown only if supplied; it is not manufactured by the Agent.
- `ParticipantDirectoryAdapter.list(profileId)`: returns bounded stable participant IDs and display names. The current profile maps to payer ID `demo-profile`. Unknown or non-unique names require clarification; display names are never debt identity keys.
- `SplitAllocationAdapter.allocate({ receipt_id, receipt_version, receipt, request })`: receives reviewed items and proposed stable-ID assignments, payer/account/time context. Returns stable `split_id`, matching receipt/version/assignment hash, original-currency total, payer share, positive debtor shares and source Badge. Steve computes the shares. Money & Ledger validates identity, currency, sum and receipt/assignment/version binding; it does not divide items or infer shares from model output.

Adapter calls are bounded by an eight-second orchestration timeout and 64 KiB serialized result. Real adapters must enforce transport cancellation/timeouts as well, use trusted server service configuration, and never accept a model-supplied URL. Adapter schemas are validated before use. Bounded extraction can be retained with `review_issues` when item IDs/currencies/totals need correction; allocation is blocked until reviewed items plus tax minus discount reconcile to total. Quantities are display/review data; this backend does not implement unit-price or allocation calculations. All current debtor rows are positive; scenarios needing zero-share selected debtors or more than 20 participants/items need a later agreed contract.

## API and review state

| Method | Session-relative path | Purpose |
| --- | --- | --- |
| POST | `/attachments` | Bounded binary JPEG/PNG upload |
| POST | `/receipts` | `{ attachment_id }`: extract through configured adapter; repeated reference returns the existing draft |
| GET | `/receipts/:draftId` | Current receipt-review card and directory |
| PATCH | `/receipts/:draftId` | `{ expected_version, receipt }`: entire corrected receipt, new version |
| POST | `/receipts/:draftId/allocations` | Assignment proposal; creates a new version, asks clarification or returns a trusted allocation proposal |
| GET | `/receipt-proposals/:proposalId` | Trusted allocation card, with current stale/confirmed state |
| POST | `/receipt-proposals/:proposalId/confirm` | **Explicit frontend confirmation only**, no model tool |

All are prefixed `/api/agent/sessions/:sessionId`. Existing error envelopes are preserved. UUID/session/profile ownership is checked throughout. Existing `POST /api/shared-expenses/confirm` remains the separate proposed trusted Steve handover; this receipt route calls its same accounting service internally rather than duplicating posting logic.

State progression:

```text
upload -> extraction v1 (review_required)
       -> receipt edit v2 (review_required; assignments cleared)
       -> partial assignments v3 (clarification_required; no confirmation ID)
       -> complete adapter allocation v4 (review_required; trusted proposal ID)
       -> explicit frontend confirmation (confirmed; editing locked)
```

Receipt edits and assignment proposals always increment the current version, including a no-op edit. All earlier confirmation proposals become stale. Extraction is immutable and separate from every corrected version; corrections have their own User-Entered badge. Assignment proposals, validated adapter output and trusted posting input are persisted separately. Database triggers protect original extraction/version rows and immutable proposal bindings.

A trusted proposal hash binds session/profile, receipt ID/version, original extraction, corrected receipt/provenance, assignments, payer/account/payment time, calculated amounts and review-required state. A client cannot submit final shares to confirmation. Before posting, the service requires current version and both review acknowledgements, rechecks the stored binding and reuses existing account, currency, total, ownership, duplicate and tracked-funds validation. Proposal claim, financial posting and durable confirmation result commit in **one database transaction**, so an edit cannot race between review validation and debit.

The receipt-review card is `{ type: 'receipt_review', draft_id, version, attachment_id, review_state, extracted, reviewed, corrections_badge, review_issues, participants, next_action }`. `extracted` retains original source provenance and optional confidence; `reviewed` is editable through the PATCH route. An inconsistent extraction remains editable with explicit issues rather than becoming a trusted financial allocation.

The allocation card is `{ type: 'allocation_review', draft_id, version, proposal_id, review_state, assignments, participants, payer_id, paid_from_account, paid_at, allocation, reconciliation, clarification, assumptions_requiring_confirmation, next_action }`. `allocation` contains **adapter-calculated** payer/debtor shares and Badge. `reconciliation` is `validated` only after server validation. Partial proposals have no trusted confirmation ID and `not_calculated` reconciliation. A full card still requires receipt and allocation review; it is not a posted expense.

## Frontend payloads

Example upload from a local client (the client reads its file; the server accepts only bytes):

```powershell
$base = 'http://127.0.0.1:3000'
$session = Invoke-RestMethod -Method Post "$base/api/agent/sessions" -ContentType application/json -Body '{}'
$prefix = "$base/api/agent/sessions/$($session.session_id)"
$upload = Invoke-RestMethod -Method Post "$prefix/attachments" -ContentType image/png -InFile '.\my-receipt.png'
```

Send a message with the explicit attachment reference:

```json
{
  "message": "Review this receipt",
  "idempotency_key": "receipt-message-001",
  "attachment_id": "<owned attachment UUID>"
}
```

Subsequent messages use `receipt_draft: { "draft_id": "<UUID>", "version": 1 }` instead of `attachment_id`. Receipt references cannot be combined with `decision` or quote `snapshot_id`. Each message reference must use the version currently shown by the frontend. The existing exchange/withdrawal parser does not interpret receipt timestamps, quantities or account wording as a new financial decision. Retry the original chat key only for replay; replayed cards are historical snapshots, so GET the current draft/proposal before editing/confirming.

An Agent request such as “Split this with Daniel and Tze Loon. Tze Loon did not have drinks” asks whether the payer shared beverages and which selected IDs belong on each unassigned item. It does not assign beverages to Daniel by exclusion. Unresolved drink/identity clarification survives subsequent Agent proposal attempts. The frontend can resolve by selecting stable participants/assignments explicitly. The scripted adapter is deliberately limited to the named fixture and its English example phrases; use the structured routes for other review interactions.

Example complete assignment payload to `/receipts/:draftId/allocations` (use the **current** version):

```json
{
  "expected_version": 2,
  "participant_ids": ["demo-profile", "demo-daniel", "demo-tze-loon"],
  "payer_id": "demo-profile",
  "paid_from_account": "krw_cash",
  "paid_at": "2026-10-19T06:00:00.000Z",
  "payment_mode": "new_payment",
  "assignments": [
    { "item_id": "food", "participant_ids": ["demo-profile", "demo-daniel", "demo-tze-loon"] },
    { "item_id": "beverages", "participant_ids": ["demo-daniel"] },
    { "item_id": "additional", "participant_ids": ["demo-profile"] }
  ]
}
```

The result advances the version to 3 and returns a trusted `proposal_id`. Display the current receipt and allocation/provenance, then submit this payload to `/receipt-proposals/:proposalId/confirm` only after an explicit user-facing action:

```json
{
  "frontend_action": "confirm_reviewed_split",
  "idempotency_key": "receipt-confirmation-001",
  "expected_version": 3,
  "receipt_review_acknowledged": true,
  "allocation_review_acknowledged": true
}
```

These action/acknowledgement fields are an application protocol, not proof of an authenticated click. Changed final shares/account/receipt fields are rejected by the strict confirmation schema; they require a new reviewed proposal. A chat “yes” can read the receipt or clarify metadata but never call this route. The model receives only bounded item IDs/labels and participant references to propose assignments; labels remain untrusted data, and financial amounts are rendered from the validated service cards.

## Financial result, recovery and risk follow-up

Success returns the **existing shared-expense posting result** (posting/activity IDs, split/receipt references, recorded debit, personal expense, authoritative receivables, linked ledger entry, balances, budget, original-derived provenance and confirmation metadata), plus:

```text
receipt_proposal_id: <trusted proposal UUID>,
history_decoration: {
  status: "available" | "unavailable",
  read_url: "/api/agent/sessions/<session>/history",
  retry_financial_action: false
},
pending_plan_follow_up: {
  status: "refresh_required", method: "GET", url: "/api/plans/assessments",
  financial_action_succeeded: true, retry_financial_action: false
}
```

The accounting remains one full-bill debit, a separate payer expense and positive receivables, with no income or extra friends' cash debits. Source Simulated/Indicative provenance is never upgraded by user acknowledgement. Same-currency/current-user-payer restrictions remain; cross-currency, other-payer and existing-payment linking return explicit unsupported errors. Historical recording is independent of reserve-warning approval. Insufficient tracked funds still returns `RECONCILIATION_REQUIRED`, with all money and draft-claim changes rolled back.

Confirmation idempotency is session-scoped. Same key/body replays the original durable financial result; changed body/proposal conflicts. A new key on the same confirmed proposal also returns its original result. Concurrent SQLite requests can return retryable `DATABASE_BUSY`; retry the same key. Version compare-and-update, receipt/split uniqueness and existing ledger idempotency prevent duplicate debits/receivables. A confirmed draft cannot be edited/reallocated.

After the transaction commits, an optional history availability read is isolated with error handling. Its failure returns posting success with `history_decoration.status = 'unavailable'`, never a generic financial failure. The result is already stored atomically on the proposal and confirmation request. Retry recovers it without another debit. Proposal/history rendering uses persisted participant/financial snapshots, not a live directory.

Existing GET `/api/agent/sessions/:sessionId/history` preserves `items` and `next_cursor`. It adds **separately paginated** `receipt_events` and `next_receipt_cursor`; pass `receipt_cursor=<confirmed proposal UUID>` for the next event page (same bounded `limit`, maximum 20). Each event contains `{ event_id, created_at, card: { type: 'shared_expense_recorded', proposal_id, data: <original posting result> } }`. Events are reconstructed from the durable posting result; no second history-write transaction is required. Confirmed/stale allocation cards are refreshed when reading chat history. Historical receipt-review cards retain their original version. Tze Loon must merge/render the separate event collection rather than assuming a confirmation is an LLM-authored chat message.

The frontend should refresh `/api/plans/assessments` or Home after success, then request “Review my pending plan risks” through the existing `read_pending_plan_risks` flow. An assessment failure is a separate read failure; do not blindly retry a successful financial action. Individual risk cards do not assert causation. A KRW Cash receipt is not described as causing a MYR reserve breach, and no “newly caused/worsened” claim is made without before/after proof. The Agent cannot modify/cancel a plan.

## Fixture and integration requirements

With `RECEIPT_PROVIDER=demo`, **every valid uploaded image** receives the same labelled fictional receipt. The OCR adapter explicitly says it returned a fixture and **did not read or interpret image content**. There is no invented confidence score. Each attachment gets a stable demo receipt ID for its draft; this is not real-world duplicate-receipt detection.

The only supported allocation fixture is exactly: KRW 42000 shared food among payer/Daniel/Tze Loon, KRW 7000 beverages Daniel only, and KRW 1000 additional item payer only. With those exact selected assignments, validated shares are payer 15000, Daniel 21000, Tze Loon 14000. Any changed receipt (including merchant/date fields) or other allocation returns `DEMO_ALLOCATION_UNSUPPORTED`, not invented recalculation. Users can review/edit data and see the limitation, or restore the fixture to exercise confirmation. This adapter is not Steve's allocation engine.

Steve must provide agreed OCR/review/allocation schemas, error behavior and trusted service-access configuration; stable receipt/split IDs across retries; actual participant/profile identity mapping; stable item IDs, quantity/line-total/tax/discount semantics; optional confidence provenance; supported allocation/rounding rules and exact total reconciliation; and matching receipt-version/assignment binding. Production cross-currency actual-debit semantics and existing-payment linking remain separate work. No endpoint URL has been assumed.

Tze Loon must wire raw upload, receipt edits, stable-ID participant selection and item assignments, current-version refresh/stale handling, both review acknowledgements and an explicit confirmation button. Render original and corrected provenance separately, preserve retry keys, display committed history events, and refresh independent pending-plan risk cards separately. No frontend screen is included here.

## Observed checks (2026-10-19)

Disposable manual checks used a fresh temporary database and private image directory, then removed both. No test suite is retained. Observed: valid JPEG/PNG decoding; signature/truncation/size/dimension/path/URL rejection; owned attachment/session/profile checks; extraction and chat produce no financial records; ambiguous drinks and unknown/duplicate names ask clarification; corrected values retain extraction and invalidate old proposals; invalid adapter totals/forged shares/missing acknowledgements rejected; fixture edits clearly unsupported; explicit concurrent confirmation debits 50000 KRW once and creates 21000/14000 receivables with 15000 personal expense and no income; same/different-key replays remain single-debit; first-post history failure retains success and recoverable history; insufficient funds retains reconciliation error with rollback; P1, P3, scripted P5, shared expenses and risk follow-up still work. Inconsistent source totals stayed editable while allocation was blocked; corrections retained the source amount and supplied confidence. Expired/orphan image cleanup retained review/financial metadata. Real Groq/Steve were not called.

The additive local migration preserved hashes of every pre-existing row, and no demo attachment/draft/financial posting was created in the configured database. Final build, type-check and lint passed after removing the disposable checks.

The receipt-step audit baseline was 13 high package findings, including 4 in the production view. The subsequent [dependency review](dependency-audit.md) applied matched Prisma/client 6.19.3 and TypeScript ESLint 8.71.2, reducing the full/production audit to 3 high package entries for one remaining deepmerge-ts advisory through Prisma config. A reviewed Prisma major migration remains recommended. Sharp was not listed in these advisories. Build/type-check/lint and isolated migration/demo checks passed; audit is still nonzero and these checks are not a vulnerability-free claim.

# Agent receipt review and split allocation

Steve's HTTP image-receipt and deterministic allocation **preview** services are now connected through `RECEIPT_PROVIDER=steve`. Uploaded bytes reach Python, but its OCR still returns a **Simulated sample** and does not interpret image content. Steve calculates reviewed allocations through an additive pure-preview route; Node retains its original review/version/confirmation workflow. Legacy Python allocation/receivable/settlement writes and bridge callbacks are **not connected**. See [HTTP mappings and observed checks below](#steve-http-integration-2026-10-20). Earlier [Groq checks](groq-verification.md) used Simulated receipt adapters and remain separate evidence.

Node owns attachment/session boundaries, versioned review proposals, explicit confirmation, financial validation, ledger/balances/authoritative receivables and settlement. Steve owns OCR and deterministic allocation calculations. Stable participant IDs are configured server-side until an authenticated contact directory exists. The Agent can propose assignments and persist review metadata; it has no financial posting tool.

## Local configuration and image uploads

The existing environment loader is reused. With no provider setting, receipt adapters remain unavailable; `.env.example` now shows explicit Steve HTTP configuration with an empty participant placeholder. Model and receipt providers are independent. For explicitly simulated **fixture-only** development in the PowerShell session starting the server (use only an isolated/fresh demo database for migration/seed work):

```powershell
$env:AGENT_PROVIDER = 'demo'
$env:RECEIPT_PROVIDER = 'demo'
npm run db:generate
npm run db:migrate
npm run dev
```

This makes no Groq call and does not contact Steve. To disable receipt integration, clear the process override and set `RECEIPT_PROVIDER="unavailable"` in ignored `.env`. Fixtures need no service URL. For Steve HTTP, use the configuration below; do not reset, migrate, seed or recopy the configured financial database to try receipt integration.

`POST /api/agent/sessions/:sessionId/attachments` accepts **raw** `image/jpeg` or `image/png` bytes. JSON bodies, paths, remote URLs and client filenames are not upload references. The route checks session/profile ownership, a 4 MiB input limit, matching binary signature, actual decoder format, decoded dimensions (1–4096 per side) and complete pixel decoding. The private stored copy is normalized to PNG, strips embedded metadata and must also fit 4 MiB. Sharp is pinned for decoding; Fastify was updated within version 5 to address reported request-validation advisories.

The response contains an opaque `attachment_id`, dimensions and expiry; it never exposes a filesystem path. Server-generated names live in `.local/receipts`, outside public/static/build directories and ignored by Git. Optional `RECEIPT_STORAGE_DIR` is **server-only configuration**, not a model/client argument, and cannot name public/static/dist paths. There is no public file-serving route. Receipt source text is untrusted data, not permission or instructions.

Images expire after 24 hours. A development session is limited to 20 active attachments (a development resource limit, not production abuse protection). `npm run receipts:cleanup` removes up to 100 expired images per run, marks them purged and retains review/financial audit metadata. It also scans up to 1000 server-named files for orphan images older than 24 hours left by a crash before metadata committed. It never recursively deletes arbitrary directories. Existing extracted drafts remain reviewable after image cleanup; an expired image cannot start a new extraction. Run maintenance manually; no scheduler/notification service is added.

Production authentication is still absent. Ownership checks use the seeded `demo-profile` and session IDs; these are local-development boundaries, not secure production multi-user authorization. Keep the loopback host. Production upload storage, authenticated access, privacy/retention policy, malware/resource controls and service credentials remain integration work.

## Internal adapter contracts

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

The Steve HTTP mapping below implements reviewed line-total/ID/version semantics with a pure preview endpoint and bounded errors. Production identity, true image OCR, authenticated service access, cross-currency bill/payment semantics and existing-payment linking remain separate work. The existing explicit demo adapters still reject edited fixture allocations rather than fabricate recalculations.

Tze Loon must wire raw upload, receipt edits, stable-ID participant selection and item assignments, current-version refresh/stale handling, both review acknowledgements and an explicit confirmation button. Render original and corrected provenance separately, preserve retry keys, display committed history events, and refresh independent pending-plan risk cards separately. No frontend screen is included here.

## Observed checks (2026-10-19)

Disposable manual checks used a fresh temporary database and private image directory, then removed both. No test suite is retained. Observed: valid JPEG/PNG decoding; signature/truncation/size/dimension/path/URL rejection; owned attachment/session/profile checks; extraction and chat produce no financial records; ambiguous drinks and unknown/duplicate names ask clarification; corrected values retain extraction and invalidate old proposals; invalid adapter totals/forged shares/missing acknowledgements rejected; fixture edits clearly unsupported; explicit concurrent confirmation debits 50000 KRW once and creates 21000/14000 receivables with 15000 personal expense and no income; same/different-key replays remain single-debit; first-post history failure retains success and recoverable history; insufficient funds retains reconciliation error with rollback; P1, P3, scripted P5, shared expenses and risk follow-up still work. Inconsistent source totals stayed editable while allocation was blocked; corrections retained the source amount and supplied confidence. Expired/orphan image cleanup retained review/financial metadata. Real Groq/Steve were not called.

The additive local migration preserved hashes of every pre-existing row, and no demo attachment/draft/financial posting was created in the configured database. Final build, type-check and lint passed after removing the disposable checks.

The receipt-step audit baseline was 13 high package findings, including 4 in the production view. The subsequent [dependency review](dependency-audit.md) applied matched Prisma/client 6.19.3 and TypeScript ESLint 8.71.2, reducing the full/production audit to 3 high package entries for one remaining deepmerge-ts advisory through Prisma config. A reviewed Prisma major migration remains recommended. Sharp was not listed in these advisories. Build/type-check/lint and isolated migration/demo checks passed; audit is still nonzero and these checks are not a vulnerability-free claim.

## Steve HTTP integration (2026-10-20)

This is the later receipt-only change, preserving the uncommitted Compare integration. Node now uses `src/receipts/steve-adapter.ts`; Compare and receipt adapters share the trusted bounded transport in `src/integrations/steve-http.ts`. No dependency, shared financial model or migration was changed. No settlement callback/HTTP adapter was enabled.

### Setup

Use the existing two-terminal FastAPI/Node commands in [README](../README.md). Run **this updated Python checkout**, including the new preview/image routes, and restart both processes. An old deployment that lacks these routes fails clearly; Node never falls back to the legacy write route.

Configure receipt mode in the PowerShell session that starts Node (the identities below are fictional demo examples):

```powershell
$env:RECEIPT_PROVIDER = 'steve'
$env:STEVE_COMPARE_BASE_URL = 'http://127.0.0.1:8000'
$env:RECEIPT_PARTICIPANTS_JSON = '[{"participant_id":"demo-profile","display_name":"Payer"},{"participant_id":"demo-daniel","display_name":"Daniel"},{"participant_id":"demo-tze-loon","display_name":"Tze Loon"}]'
npm run dev
```

Or put the same values privately in ignored `.env` and clear inherited overrides before starting Node. No key/password is needed for loopback FastAPI, and none belongs in frontend configuration. The model provider is independent: `AGENT_PROVIDER=demo` remains scripted, while real Groq needs its private local settings. The scripted model's allocation example is limited to its original fixture IDs; use the structured review endpoints or a configured real model for arbitrary HTTP receipt assignments. That scripted limitation is not an OCR or allocation fallback.

Receipt URL precedence is nonempty `STEVE_RECEIPT_BASE_URL`, then `STEVE_BASE_URL`, then the existing `STEVE_COMPARE_BASE_URL`. A blank receipt override deliberately reuses the common/Compare service. Configured URLs permit HTTPS, or HTTP on loopback; no credentials/query/fragment, redirects or request/model-supplied URLs. Optional `STEVE_RECEIPT_TIMEOUT_MS` defaults to 5000, bounded 250–7000 ms below the existing 8-second orchestration limit. Both POSTs have one attempt and at most 64 KiB JSON response; image upload is at most 4 MiB. Failures surface safe `RECEIPT_*` errors without upstream bodies or private payload logging.

`RECEIPT_PARTICIPANTS_JSON` is a bounded server-only array of unique stable IDs/display names, including the current `demo-profile` payer. It is **not** a live contact directory or authentication system. Duplicate display names are allowed with different IDs. Missing/invalid identity configuration is an error, never an automatic demo directory. No display-name match converts a returned debtor into an ID. The Node workflow still requires the current user payer, same bill/paying-account currency, explicit payment time and new-payment recording. Steve preview currently supports KRW bills only. Selected zero-share debtors remain unsupported by the existing Node contract; remove them and review again.

### Actual routes and side effects

| Route | Current behavior | Node uses it? |
| --- | --- | --- |
| Existing `POST /api/split/ocr` | Returns sample receipt; did not accept/pass an image | No |
| **New** `POST /api/split/ocr/image` | Streams bounded raw normalized PNG bytes to `extract_receipt_ocr(image_bytes=..., use_sample=False)`; returns receipt, SHA-256, byte count and explicit sample/interpretation flags | Yes |
| Existing `POST /api/split/allocate` | Creates Python in-memory receivables and emits `shared_expense_paid` (or appends a bridge log) immediately | **Never** |
| **New** `POST /api/split/allocate/preview` | Computes shares only; no stores, receivable IDs, bridge callback/log or posting event | Yes |
| Existing Python receivable/settlement routes | Process-local writes with incompatible settlement ownership/replay semantics | **Never** |

The pure calculation was factored out of `allocate_bill_split` as `_calculate_shares`. Both legacy and preview flows use Steve's same integer remainder and tax/discount calculation; Node does not implement a second allocation engine. The legacy route, models and financial side effects remain backward compatible for its existing callers. The new preview function never calls that legacy write flow, even with a registered callback. A preview failure or a losing Node version race therefore has no Python financial state to undo. Node confirmation never replays a `shared_expense_paid` event after posting.

### OCR mapping and provenance

The new image route **receives** the actual private normalized PNG. Node verifies the returned SHA-256/byte count against the bytes sent. The current `extract_receipt_ocr` implementation still ignores image content and returns `SAMPLE_KOREAN_RECEIPT`, even with `use_sample=False`. Its wrapper explicitly says `mode=sample`, `reads_image_content=false`; Node requires a Simulated source badge and displays the fixture notice. This is verified HTTP transport, **not real OCR**. No confidence score is manufactured.

| Python OCR | Node extraction |
| --- | --- |
| `items[].name`, integer `quantity`, `total_price_krw` | Item label, positive quantity string, line-total `{ amount_minor, currency: KRW }` |
| Tax/discount/total KRW integers | Exact KRW Money, no FX or major-unit conversion |
| Original unit prices/`assigned_to`/badge/sample receipt ID | Preserved in optional `extracted.integration.upstream_receipt`; sample name assignments do **not** become trusted reviewed participant assignments |
| Fixed sample `receipt_id` | Namespaced Node receipt ID `steve-receipt-<owned attachment UUID>`; different uploads must not accidentally collide because Python returns one fixed sample ID |
| Hash/bytes/sample flags | Retained as optional extraction integration metadata; immutable with the original extraction |

The complete original Python receipt is retained; corrected values remain separate version rows with User-Entered provenance. A real OCR implementation will need an explicit updated mode/schema mapping and its actual source provenance; it must not gain User-Confirmed status merely because the HTTP call succeeded. Explicit Node confirmation acknowledgement also does not upgrade Simulated/Indicative source provenance.

The attachment namespace is a workflow identity, not automatic detection of the same real-world bill reuploaded under another attachment. Duplicate protection remains scoped to the stored receipt/proposal and Node's unique receipt/split keys, as before.

### Allocation preview mapping

The additive `AllocateSplitPreviewRequest` uses reviewed line totals rather than inventing an integer unit price for a corrected decimal quantity:

```json
{
  "receipt": {
    "receipt_id":"steve-receipt-<attachment UUID>",
    "merchant":"Corrected merchant",
    "date":"2026-10-20",
    "items":[{"item_id":"item_1","name":"Reviewed food","quantity":"2.5","total_price_krw":42003}],
    "tax_krw":0,"discount_krw":0,"total_krw":42003
  },
  "receipt_version":4,
  "payer_id":"demo-profile",
  "participant_ids":["demo-profile","demo-daniel"],
  "item_assignments":{"item_1":["demo-profile","demo-daniel"]}
}
```

All participant keys are stable IDs, not Python legacy friend `name` values. Every item must have a nonempty assignment to unique selected IDs; the preview route rejects omissions instead of using the legacy payer default. Node handles missing/ambiguous assignments before calling Python and persists clarification without a trusted confirmation proposal. Use item IDs returned by review; `item_1` here illustrates the current sample, not a universal item identifier.

Node receives `expected_version=3` from the frontend, sends `receipt_version=4` for the prospective assignment version, then atomically appends that version only if the draft is still at version 3. Edits invalidate older proposals. The pure upstream result can safely be discarded when a concurrent edit wins.

The response includes:

```text
preview_only: true
financial_mutation: false
preview_id: split_preview_<SHA-256 of the complete preview request>
receipt_id, receipt_version, payer_id, item_assignments
total_bill: KRW Money
participant_shares: [{ participant_id, amount_minor }]
item_shares: [{ item_id, shares: [{ participant_id, amount_minor }] }]
adjustments: [{ participant_id, amount_minor }]   # signed net tax minus discount
badge: Indicative; deterministic reviewed allocation, not confirmed/posted
```

Before mapping to `AllocationResult`, Node validates IDs/version, echoed assignment lists (including their order), total/currency, exact selected participant sets, and every item-share identity set. Item shares must sum to the reviewed line amount and satisfy Steve's equal-split spread bound. Signed adjustments must sum to reviewed tax minus discount. For every participant, item contributions plus adjustment must equal the returned share; all shares then sum exactly to the bill. Node validates these invariants with integer arithmetic, but Steve chooses the actual allocation/remainder/adjustment amounts. Invalid or negative results are rejected rather than repaired or guessed. Some discount/zero-share edge cases can consequently remain unsupported under the existing engine/Node restrictions.

The validated preview ID becomes the split reference; positive non-payer shares become stable-ID debtor-share proposals, **not receivable records**. No reference FX amounts are fabricated. Optional `allocation.integration.upstream_preview` retains the full proof and false-mutation flags in the existing immutable proposal JSON. Paying account/time remain Node-owned confirmation context and are not needed for Steve's allocation arithmetic. No shared financial model, database schema or migration changed; `integration` fields are optional additions to internal receipt wrappers.

Only the existing explicit `/receipt-proposals/:proposalId/confirm` can invoke Node shared-expense posting. It revalidates the immutable binding/current version and commits the full-bill debit, personal allocation, linked authoritative receivables and idempotent result together. It needs no Python request. Stored review/proposal/history remains usable during an HTTP outage as long as local identity configuration remains valid.

### Original settlement proposal — superseded by the Node adapter

The receipt-only step left settlement unwired. The subsequent [implemented Node settlement contract](settlements.md) now provides authoritative reads/history and explicit frontend repayment confirmation. It uses Node IDs and the existing ledger transaction; Python legacy routes/events remain disconnected. The table below records the original mapping proposal for context, not an instruction to replay Python events. The narrow implemented endpoint accepts no fees or FX snapshots and requires independently confirmed clearance/received amounts.

| Python event field / concern | Proposed Node settlement mapping |
| --- | --- |
| `receivable_id` | Must resolve through an explicit trusted mapping to an owned Node receivable; current Python in-memory IDs are not that mapping |
| `locked_krw_cleared` | Candidate original-currency debt clearance → `amount_cleared` in the receivable's KRW currency; require explicit reviewed amount bounded by the remaining debt, including partial settlement |
| `actual_paid` | Independently user-confirmed `amount_received`; MYR sen or KRW won as actually received, matching the receiving account. Never derive it from the original allocation's reference FX |
| `target_account` | `MYR_BANK → myr_funding`, `KRW_CARD → krw_card`, `KRW_CASH → krw_cash`, after ownership/currency validation |
| Optional source rate | Preserve allocation/reference FX separately. If an actual settlement snapshot is supplied to the existing ledger service, its direction must be clearance/receipt currency, e.g. `KRW/MYR`; a stored `MYR/KRW` allocation snapshot cannot simply be passed through |
| Fees | Explicit actual fee amounts/accounts, separate from the repayment principal; do not debit or clear them twice |
| Confirmation/replay | New explicit frontend boundary, stable idempotency key and one Node transaction; never a chat tool or a raw Python callback |

For example, **KRW 21000 debt cleared** and **MYR 6656 sen actually received** are distinct facts. Node would reduce the original KRW receivable by 21000 and credit MYR Funding by 6656 once, recording a settlement rather than income. It must not convert 6656 through a reference rate to invent the debt cleared. Same-currency clearance/received principal must match under the existing service, with fees separate. The remaining debt is original debt minus confirmed clearance amounts in original currency, not original debt minus converted received money.

The current Python settlement function instead flips the whole `settled` boolean and emits the entire original `locked_krw_cleared` amount, even though its request has only actual money received and no partial-clearance field. It mutates before calling its callback, has no Node durable replay/transaction binding and raises on repeated settled requests. Those semantics cannot be safely dual-written to Node. Future work must agree partial clearing, identity, confirmation, actual source provenance and durable atomicity before connecting anything. Neither the legacy settlement route nor bridge-log polling is called by the new adapter.

### Observed receipt integration checks

On **20 October 2026**, separate actual Uvicorn and compiled Node processes used a new temporary SQLite database with existing migrations/fictional seed and private temporary uploads. A local observation/fault proxy saw the actual request bodies and bytes without printing them. The configured Supabase database was never opened or modified. Original `.env`, SQLite/sidecars and local upload hashes were unchanged; temporary databases/images/processes were removed.

| Scenario | Observed result |
| --- | --- |
| Actual upload/OCR | Passed: JPEG was decoded/normalized privately in Node; Python received the normalized image, matching SHA-256/byte count. Output explicitly remained the fixed Simulated sample, with no image interpretation. |
| Corrections/source | Passed: corrected merchant/date, quantity `2.5`, line total 42003, tax 7 and discount 2 reached preview unchanged. Original extraction/provenance was retained. No unit price was invented. |
| Identity/ambiguity | Passed: two contacts with the **same display name** and different stable IDs received distinct shares/linked receivables. Missing beverage assignment returned clarification and no trusted ID or Python allocation call. |
| Reconciliation/pure preview | Passed: per-item proof, adjustments and final shares reconciled exactly. Extraction/review/allocation changed no Node financial rows and no Python receivable store/bridge log. A separate pure-function check proved an already-populated Python store/log and registered callback were untouched by repeated previews, and missing assignments were rejected. |
| Versions/ownership | Passed: foreign-session attachment/proposal reads rejected; edits made old proposals stale; stale confirmation rejected; repeated extraction preserved edits and original source. Different uploads did not collide on the fixed upstream sample receipt ID. |
| Explicit confirmation/concurrency | Passed during a simulated service outage: concurrent confirmations converged on one activity, one full-bill debit and two linked authoritative receivables. Same-key and new-key replays returned that original result; changed payload conflicted. No Python bridge/event request occurred. |
| Recoverable failures | Passed for outage, timeout, invalid JSON, >64 KiB, redirect, altered assignment/share/item proof, write flag and image hash mismatch. Failed extraction retained the upload without a draft; failed allocation left version/proposal/financial state unchanged. Recovery used the same upload/current review, with no fixture fallback or POST retry. |
| Regression | Passed: scripted Agent receipt tool used the real HTTP adapter; existing Steve Compare/Agent proposal retained four Visa options and totals 34374/34427/34427/35157 sen; chat changed no financial records; Home and pending-plan risk reads worked. The existing isolated Node shared-expense demo and explicit fixed receipt adapters also passed. |
| Real Groq | A separate limited journey with privately configured **`openai/gpt-oss-120b`** passed. Groq actually selected **`extract_receipt_review`** then **`propose_receipt_allocation`**, both successful through the HTTP receipt adapters. It returned a trusted allocation review proposal, with source still Simulated and financial state unchanged. No confirmation was sent. Scripted/service checks above are not counted as additional model evidence. |
| Checks | Build, type-check, backend-source lint, Python dependency check, existing calculator/splitter checks passed. Full root lint still reports the same **26 existing frontend errors**; no frontend files/rules/checks were disabled. |

These are local backend/service checks, not production, live OCR, authenticated identity or broad model/concurrency guarantees. The earlier real-Groq Compare journey remains documented separately. No frontend screen, translation, dependency upgrade, settlement integration, permanent test suite, commit or push was added in this step.

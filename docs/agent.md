# Agent backend handoff (Priority 5)

**Current risk-tool pagination:** [server-managed continuation contract and observed verification](agent-risk-pagination.md). `read_pending_plan_risks` takes optional `limit`/opaque `continuation`, defaults to page one and never accepts model-supplied database cursor IDs. Invalid/stale references restart with a real first-page result and recovery metadata. The Home assessment API and explicit frontend refresh remain unchanged.

The Agent helps international students read owned balances, inspect limited history/plans, clarify decisions, retrieve supported comparisons and preview a pending-plan proposal. It executes no financial transactions. **Chat cannot save, confirm or cancel a plan, post a ledger entry, or change profiles/reserves.** A chat “yes” is never the frontend Save action.

The later [confirmed Split handover](shared-expenses.md) adds an explicit confirmation endpoint and proposes the additive `shared_expense` ledger type. It is not registered as an Agent financial tool. [Current pending-plan assessments](pending-plan-risk.md) are available through Home and `read_pending_plan_risks`. [Receipt review adapters](receipt-review.md) now let the Agent prepare receipt/assignment metadata, with a separate explicit frontend confirmation. No tool posts financial records. See [limited real Groq observations](groq-verification.md), which distinguish real model tool selection from Simulated adapters.

The current local demo has one unauthenticated profile and only MYR Funding, KRW Card and KRW Cash. Currency/account names are explicit; wording does not assume the user lives in a particular country. Session ownership is enforced against the server's demo-profile context and quote/proposal IDs are scoped to sessions. This is not production authentication or secure multi-user isolation.

## Configure and run

```powershell
# Existing .env: add these variables; do not replace existing database settings.
# Keep the real key only in the server environment or ignored .env, never in frontend code/chat.
# GROQ_API_KEY=your-server-side-key
# GROQ_MODEL=an-available-model-supporting-local-tool-calling
# AGENT_PROVIDER=groq
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

There is **no default model name**. Pick an available model supporting local function/tool calling from [Groq's tool documentation](https://console.groq.com/docs/tool-use) and [models](https://console.groq.com/docs/models). The replaceable adapter uses existing Node `fetch` against [Groq's compatible API](https://console.groq.com/docs/openai); no SDK dependency was added. API keys remain in the server adapter, and provider response/error bodies are never logged or returned. Default Home and plan routes still run without model configuration.

`GET /api/agent` reports `{ available, provider, simulated, authentication }`. If key/model is missing, sending a message returns HTTP 503 `AGENT_UNAVAILABLE` with an explanatory structured response. It does not run a scripted substitute. Sessions/history remain available.

For **explicitly scripted development**, launch the server with:

```powershell
$env:AGENT_PROVIDER = 'demo'
npm run dev
```

The demo adapter labels every response as scripted, performs no model call and needs no credentials. Against that running server, `npm run demo:agent` exercises clarification, comparisons and the fact that chat leaves balances unchanged. Each run creates a session. Optional `DEMO_AGENT_SAVE=true` demonstrates a **separate frontend Save API call**, stopping if reserve acknowledgement is needed. `DEMO_BASE_URL` changes the client's loopback URL. `AGENT_DEMO_FAILURE=rate_limit` or `unavailable` on a demo server explicitly simulates provider failure.

Initial local verification used these labelled demo modes because Groq configuration was unavailable. Later [real Groq smoke checks](groq-verification.md) used local server credentials and isolated data. No key should be pasted into chat. These checks do not verify live comparison, OCR or allocation integrations.

## API and minimal frontend sequence

All paths below are relative to `http://127.0.0.1:3000`. Errors retain `{ error: { code, message, details?, request_id } }`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/agent` | Provider availability, no credentials returned |
| POST | `/api/agent/sessions` | Create session; empty `{}` body |
| GET | `/api/agent/sessions/:sessionId` | Active proposal reference and provider availability |
| POST | `/api/agent/sessions/:sessionId/messages` | Idempotent read/preview conversation turn |
| GET | `/api/agent/sessions/:sessionId/history?limit=10&cursor=<message_id>` | Persisted history, oldest first, max 20 messages per page |
| GET | `/api/agent/sessions/:sessionId/proposals/:proposalId` | Original proposal with current `stale` flag |
| POST | `/api/agent/sessions/:sessionId/proposals/:proposalId/preview` | **Frontend** re-preview of trusted snapshot; empty `{}` |
| POST | `/api/agent/sessions/:sessionId/proposals/:proposalId/save` | **Frontend Save action only**; delegates to Priority 3 |

Example PowerShell:

```powershell
$base = 'http://127.0.0.1:3000'
$session = Invoke-RestMethod -Method Post "$base/api/agent/sessions" -ContentType application/json -Body '{}'
$prefix = "$base/api/agent/sessions/$($session.session_id)"
$body = @{ message = 'I want to exchange MYR 300'; idempotency_key = [guid]::NewGuid().ToString() } | ConvertTo-Json
$turn = Invoke-RestMethod -Method Post "$prefix/messages" -ContentType application/json -Body $body
$turn.response | ConvertTo-Json -Depth 30
```

Message request:

```json
{
  "message": "I want to exchange MYR 300",
  "idempotency_key": "unique-message-request-key"
}
```

Human prose uses server templates, not unchecked model-generated financial claims. Success response shape:

```text
{
  turn_id, session_id,
  response: {
    status: "ok" | "clarification_required" | "unsupported" | "unavailable" | "provider_error",
    explanation,
    provider: { name: "groq" | "demo", simulated },
    cards: [...typed authoritative service cards...],
    clarification: [{ field, question }],
    decision, decision_badge, defaults_used,
    next_action, active_proposal_id, error_code?
  }
}
```

`AgentResponse` and the discriminated `AgentCard` union are exported from `src/agent/contracts.ts`. Money in cards is copied from validated service DTOs with provenance. The `decision_badge` identifies user-entered intent amounts; they are not quotes. Financial numerals are kept on cards, rather than invented in narrative. Render strings as plain text, including provider/source text. Always show Simulated/Indicative badges and the demo-adapter label.

Cards include Home balance/budget DTOs, limited shared-ledger entries, small shared-Plan summaries, adapter-ordered quote selections with Priority 3 previews/blocking errors, reserve warnings, existing-balance alternatives and proposed plans. Full plan audit metadata and ledger activity inputs are omitted from read tools. A proposed-plan card contains `proposal_id`, `snapshot_id`, stable `quote_id`, authoritative `preview`, `stale` and `next_action: "preview_before_frontend_save"`. It is not a saved shared Plan. Use the original shared Plan DTO only after explicit Save succeeds.

## Clarification and assumptions

### Proposed internal Compare addition for Steve: card network

`POST /api/agent/sessions/:sessionId/messages` accepts optional `decision.card_network` (trimmed lowercase string, 1–60 characters). It is retained in the session decision, model context and quote request metadata, and passed unchanged to `CompareAdapter.compare(decision)`. Recognized network names in chat can populate the slot; structured input supports other network names. The string `unknown` explicitly means the user does not know. Same-objective clarification retains existing slots; a different objective starts a new decision. This does not change the agreed shared Profile, Quote, Plan or LedgerEntry models.

The adapter hook `requiresCardNetwork?(decision): boolean` requests ATM network clarification before Compare runs. Both configured implementations enable it. Steve HTTP maps the four supported networks to his actual filter; explicit `unknown` omits the filter and retains unknown compatibility. Static fixture prices remain exact examples with no live lookup. See the [implemented mapping and limitations](compare-integration.md).

Option metadata stays outside shared Quote: `compatibility: { status: "unknown", reason }` or `{ status: "compatible" | "incompatible", card_network, evidence: { source, timestamp } }`. ATM results without matching evidence remain explicitly unknown. Static fixtures always have unknown compatibility, even with a real Groq model. Steve HTTP now validates actual network filtering and returned `supported_networks`; its compatible state is scoped to the seeded dataset and must be displayed with the Simulated quote badge and provider-verification caveat. This is not verified live ATM compatibility. The engine remains Steve's Python implementation.

The preserved Python `CompareQuotesRequest.card_network` accepts canonical UnionPay/Visa/Mastercard/Plus (case-normalized); the internal Agent accepts a lowercase bounded string, including explicit `unknown`. The HTTP adapter now maps known labels, omits the filter for explicit unknown and rejects unsupported networks. Objective/account identifiers, float rate representation and lowercase fee `money` are mapped explicitly in the [Compare guide](compare-integration.md). SGD and receipt schema/settlement differences remain outside this Compare-only step. Shared models and frontend screens are unchanged.

“I need cash for tonight” asks about amount/currency, amount basis, funding account and card network when the adapter requires it. Material ambiguity is not filled in by the model. Frontends can submit answers as typed `decision` fields alongside a new message:

```json
{
  "message": "Use this cash target from my card account",
  "idempotency_key": "cash-answer-001",
  "decision": {
    "objective": "atm_withdrawal",
    "amount": { "amount_minor": 90000, "currency": "KRW" },
    "amount_basis": "destination_target",
    "funding_account": "krw_card",
    "destination_account": "krw_cash",
    "card_network": "visa"
  }
}
```

These are internal decision types, not new shared Quote enums. Valid bases: `principal`, `total_debit_budget`, `destination_target`. Structured fields represent explicit frontend/user input and override matching parsed text slots. Natural-language parsing is deliberately conservative and English-oriented; it recognizes ungrouped MYR/KRW decimal amounts, explicit account names/IDs and common exchange/withdrawal phrasing. Backend validation parses major-unit text into integer minor units with BigInt; the model never converts units. Negative, grouped and ranged text amounts are rejected rather than partially interpreted. Use structured input for reliable multilingual or complex clarification.

For “exchange MYR 300”, the service visibly defaults to principal (fees additional), MYR Funding and KRW Card. For cash, destination is KRW Cash, but funding is clarified. A total budget is not interchangeable with a destination target. KRW-funded exchange and unsupported routing/currencies do not become invented conversions. Card purchases remain unsupported, without an owned-account credit or a fabricated ledger objective.

Unrelated questions do not reset the stored decision or active proposal. On resuming, financial tools read current backend state again; previous cards are not used as current balances. “Yes/save/confirm/cancel” in chat can only trigger reads/previews and a reminder to use the frontend workflow. The model has no mutation tool.

## Compare adapter and exact fixtures

`configuredCompare()` selects Steve's HTTP adapter by default (`COMPARE_PROVIDER=steve`, trusted `STEVE_COMPARE_BASE_URL` required). It calls the actual `/api/compare/quotes` and quote-read routes and validates their responses before storing Node snapshots. The calculation engine and ranking remain Steve's. His current seeded data is explicitly **Simulated** over HTTP, including formerly Indicative samples. `COMPARE_PROVIDER=fixture` separately selects **complete static simulated fixtures**; a failed HTTP request never selects them. Full request/fee/account/provenance mappings, unsupported principal/KRW-funded requests and verified results are in [Compare integration](compare-integration.md). The following table describes only explicit fixture mode.

| Exact decision | Fixture behavior |
| --- | --- |
| MYR 300 principal exchange, MYR Funding → KRW Card | Two fictional fixed-fee options |
| MYR 300 total-debit budget, same accounts | Separate complete budget fixture |
| MYR 2500 principal exchange, same accounts | Fixed-fee and percentage-fee fixtures, useful for reserve warnings/requote guidance |
| KRW 90000 cash target funded by MYR Funding | Complete fictional withdrawal; no network evidence |
| KRW 100000 cash target funded by MYR Funding | Four fixed seeded ATM examples, filtered by their listed network where known; compatibility remains unknown in fixture mode |
| KRW 90000 cash target funded by KRW Card | Fictional same-currency withdrawal |

Each fixture has a stable `quote_id`, exact shared Quote fields, consistent integer money, positive decimal rate, Simulated badge and fictional provider label. Fee/account and total-debit checks reuse Priority 3. The fixture's fee assumptions explicitly mean separate account-debited fees and destination credit before those separate fees, with a fixture-only fee-behavior assertion. These do not resolve Steve's production contract questions. Unconfirmed fee/net-received semantics or unresolved fee assertions return `unsupported`, and missing exact fixtures return `requote_required`.

Every returned option gets its own Priority 3 preview or blocking error. SafePrincipal appears only when that service says it is valid; percentage/tiered/mixed/unspecified fees request a new complete quote. A model cannot author a quote for the suggested safe amount. Insufficient funds stays blocking. Current cash/card balances are considered only through the available-balance service and exact supported objective. Existing card funds are not called cash; an alternative card-funded cash option is represented by an actual supported withdrawal fixture and preview. Existing cash is an alternative only when it directly covers the explicit same-currency cash target.

To preview another comparison card, send a new message with its server `snapshot_id`:

```json
{
  "message": "Preview this option",
  "snapshot_id": "<owned snapshot UUID from the comparison card>",
  "idempotency_key": "preview-selected-option-001"
}
```

Quotes/snapshots from another session are inaccessible to this session. No model-authored or client-modified quote JSON is accepted by the Agent Save path.

Selecting a snapshot explicitly restores its server-stored decision context; do not send `snapshot_id` and new `decision` fields in the same message. An implicit resume cannot substitute an old quote for a changed current amount/objective. If the latest decision differs, select the old proposal explicitly or request a new complete quote. Compare results are also checked against the requested amount basis, currency and routing before snapshot creation.

## Explicit frontend Save (not a chat tool)

After the user opens a proposed-plan card, call its `/preview` endpoint. This returns the authoritative stored `selection`, reuses `PlanService.preview`, and records that preview token as reviewed for this proposal. Display the returned service DTO and obtain reserve acknowledgement when required. Only an explicit frontend Save action sends:

```json
{
  "frontend_action": "save_pending_plan",
  "idempotency_key": "unique-frontend-save-request-key",
  "preview_token": "<check_token from the frontend proposal preview>",
  "reserve_acknowledgement": {
    "acknowledged": true,
    "check_token": "<same current reserve check token>"
  }
}
```

Omit `reserve_acknowledgement` when no warning applies. Quote/principal/fee fields are rejected here. The server resolves the owned snapshot and calls the existing Priority 3 save service. Its expected-preview-token check runs **inside the same save transaction as the fresh balance/reserve assessment**, so even an otherwise affordable stale proposal must be re-reviewed. Existing Priority 3 selected-quote endpoints keep their behavior; the Agent frontend should use this ID-based route instead of reconstructing a quote from card data.

`PROPOSAL_PREVIEW_REQUIRED` (409) means no matching frontend preview was recorded. `PROPOSAL_STALE` (409) means relevant balances/reserves changed after review. Refresh and re-review, then use current acknowledgement. Missing/incorrect reserve acknowledgement still returns Priority 3's `RESERVE_ACKNOWLEDGEMENT_REQUIRED` / `STALE_RESERVE_CHECK`. Saving creates a **pending** shared Plan and does not change balances or ledger entries or reserve funds. It never confirms completion. The frontend action field is an application protocol, not proof of a secure authenticated click.

The Save key is namespaced to the session/proposal before using Priority 3 idempotency. Same key/body returns the original saved result. Do not generate a new key for a network retry. Multiple explicit saves with distinct keys may create multiple pending plans, consistent with Priority 3. Completion/cancellation require their existing dedicated frontend flows and are never Agent tools.

GET proposal and history reads recheck relevant state and mark old proposed-plan cards `stale`. Other history cards are timestamped historical snapshots, not current balances. History pagination uses integer message IDs, oldest first; cursor must belong to the session. Network replay of an original message returns its original stored response; always use the frontend preview before Save, even when that replay's historical card says `stale: false`.

## Orchestration, persistence and limits

Allowed tools and strict argument schemas live in `src/agent/tools.ts`: `get_home`, `read_ledger`, `list_plans`, `read_plan`, `read_pending_plan_risks`, `compare_options`, `preview_quote`, `request_clarification`, `show_limitation`, plus `extract_receipt_review`, `read_receipt_review` and `propose_receipt_allocation`. They take no financial profile IDs, arbitrary URLs, filesystem paths, SQL or code. Receipt participants use validated stable directory IDs; the receipt reference is explicit in the message. Compare arguments use server-validated decision slots, not model amounts. Preview accepts only an owned snapshot ID. Tool descriptions and the system policy treat source/provider/user/receipt text as untrusted and cannot grant additional authority. The receipt tools can persist review metadata only; they cannot invoke confirmation or financial posting.

Receipt messages accept either `attachment_id` or `receipt_draft: { draft_id, version }`, separately from financial `decision`/`snapshot_id` selection. Render the receipt and allocation cards, then use the separate explicit reviewed-split confirmation route. Existing history responses add separately paginated `receipt_events`/`next_receipt_cursor` for authoritative `shared_expense_recorded` cards. See the [receipt guide](receipt-review.md) for exact payloads, acknowledgement/version requirements, fixture limitations and recovery if optional history reads fail.

`read_pending_plan_risks` accepts optional `limit` (1–5, default 3) and owned plan cursor. It renders `{ type: 'pending_plan_risk', data }` using the same paginated service as Home/API, with original quote provenance, current timestamp/fingerprint, independent-plan notice and deficits separate from reserve shortfalls. The model receives only read status, IDs and assessment states; authoritative monetary values stay in the cards. An unavailable assessment is explicit and never a signal to retry an already successful financial action. Scripted prompts such as “Review my pending plan risks” exercise this path. History cards remain timestamped snapshots; request a fresh read for current risk. No automatic plan modification/cancellation occurs.

Only bounded user/assistant text, intent-presence flags, owned references and small tool result summaries go to Groq. Full Home cards, ledger pages and plan/quote source text are rendered server-side, not sent back as prompt instructions. The last six text messages are included; no entire ledger is sent. Model-generated prose and private reasoning are discarded. Human explanations are server templates and financial values originate in services.

- User message: max 2000 characters; strict body schemas; existing global body limit 32 KiB.
- Model: at most four inference iterations/eight registered tool calls; max four calls in one response; model output request budget 1000 tokens, streamed response read capped at 64 KiB. Tool argument JSON is bounded and validated before dispatch.
- Stop model inference when terminal cards or clarification are ready; the server renders the response. A plan-list card alone does not finish a current-risk request. No final prose-generation call is needed after a valid proposal or allocation card.
- Timeout: eight seconds per provider HTTP attempt, forty-five-second orchestration signal; one modest retry for transient transport errors/429/5xx. Read tools retry a transient backend failure once. No financial write is retried by model orchestration.
- Ledger/plans: max five records per tool page. History API: default ten/max twenty messages per page. Final cards are bounded. Tool outputs supplied to the model contain minimal status/reference summaries, not full financial records.
- Sessions serialize turns using a ninety-second recoverable lease, without holding a database transaction during model/network calls. A concurrent in-flight request returns `AGENT_MESSAGE_IN_PROGRESS` (409), or retryable `DATABASE_BUSY` (503) during SQLite contention. After a worker crash/expired lease, retry the original key; lease ownership prevents a superseded worker from publishing duplicate output.

Persistence includes owned sessions, validated decision context, user/assistant messages and timestamps, message-request idempotency, immutable quote/proposal snapshots, structured cards, reference IDs, frontend preview records and sanitized tool execution metadata. Tool names/validated arguments, outcome/duration and small summaries are retained. No API key, hidden prompt, raw model answer, private reasoning or provider error body is stored. User text is retained as user text. Failed provider turns store a safe explanatory response; staged quotes/proposals are discarded.

Same session/message key plus the same validated payload replays the original turn, without extra messages/proposals or provider calls. Different payload gives `IDEMPOTENCY_CONFLICT` (409). Failures are also replayed; after repairing provider configuration or waiting out an outage, use a new key for a fresh attempt. Responses with provider errors use the normal error envelope, with the structured `AgentMessageResult` in `error.details`. Missing config is 503; provider rate limit is 429; outages/timeouts are safely mapped to 503. Raw internal/provider errors are not exposed.

## Verification and remaining integration

Build/type-check/lint and local API flows were run without writing a test suite. The isolated demo verified ambiguity/clarification, supported comparisons, fixed and variable fee reserve guidance, unsupported purchases, missing configuration and simulated provider failure, message replay/conflict, history pagination, session-scoped IDs, unchanged financial state during chat, and frontend Save's re-preview/stale/acknowledgement checks. Later [real Groq observations](groq-verification.md) record actual selected tools, initial failures, corrections and remaining integration limits; scripted verification is not counted as model verification.

Steve HTTP Compare and receipt allocation preview are now connected; see the separate integration guides for supported contracts and observed results. [Node settlement reads and explicit frontend repayment confirmation](settlements.md) now reuse the authoritative ledger; settlement remains unavailable as an LLM write tool, and Python legacy settlement routes/events must not be used by the integrated frontend. True image OCR, live provider data, quote expiry and production identity/authentication remain pending. Tze Loon still needs to render the typed cards/badges, collect stable-ID assignments and structured clarification, preserve retry keys, handle stale versions/previews and provide explicit Save/receipt/repayment confirmation actions. No frontend screen or provider transaction execution is added by these backend steps. Complex interpretation should use structured decision fields until a broader validated extraction layer is added.

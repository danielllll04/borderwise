# Steve Compare → Node integration

Only Compare is connected in this step. Node remains the owner of profile, balances/reserves, trusted snapshots/proposals, pending plans, explicit completion and ledger/receivable writes. Steve's FastAPI service owns quote calculations, ranking and provider/ATM data. No frontend screen or Python engine was rewritten, no Split callback was installed and no financial write tool was added to the model.

Subsequent receipt-only work on the same uncommitted branch adds HTTP image transport and pure allocation preview; see [receipt integration](receipt-review.md#steve-http-integration-2026-10-20). The transport bounds are now reused from `src/integrations/steve-http.ts`. Compare's contract, authoritative ordering and simulated provenance are retained and its HTTP/Agent proposal flow passed regression verification. The later [Node settlement adapter](settlements.md) adds authoritative debt reads and explicit frontend repayment confirmation; Python legacy Split/settlement writes remain disconnected. The dated Compare results below remain evidence of the earlier run.

## Run and configuration

Use the two-terminal commands in [README](../README.md). Windows verification used a separate ignored `.local/compare-python` environment because the team's tracked `.venv` contains Linux files. `requirements-compare.txt` matches its FastAPI 0.147.0, Uvicorn 0.54.0 and Pydantic 2.14.1 versions. Node dependencies and lockfile are unchanged.

Set these server-only values in ignored `.env`, or explicitly in the launching PowerShell session:

```dotenv
COMPARE_PROVIDER="steve"
STEVE_COMPARE_BASE_URL="http://127.0.0.1:8000"
STEVE_COMPARE_TIMEOUT_MS="5000"
```

The base URL is the service root, without `/api`, credentials, query or fragment. Remote services require HTTPS; local HTTP accepts loopback hosts only. The model and request cannot select a URL. Model provider (`AGENT_PROVIDER`) and Compare provider are independent. For real Groq, replace an inherited demo setting with `$env:AGENT_PROVIDER = "groq"`; enter the key/model privately in `.env`. To use `.env` instead of inherited PowerShell settings:

```powershell
Remove-Item Env:COMPARE_PROVIDER -ErrorAction SilentlyContinue
Remove-Item Env:STEVE_COMPARE_BASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:STEVE_COMPARE_TIMEOUT_MS -ErrorAction SilentlyContinue
Remove-Item Env:AGENT_PROVIDER -ErrorAction SilentlyContinue
```

`COMPARE_PROVIDER=fixture` explicitly enables static examples. Missing/invalid configuration fails Compare clearly while Home and other independent reads remain available. There is no fallback when Steve is offline. Successful HTTP calls do not turn seeds into live data.

## Actual contract mapping

Actual FastAPI routes from `steve_router.py`:

- `POST /api/compare/quotes` accepts `CompareQuotesRequest`, calculates/ranks quotes and puts them in Steve's process-local `QUOTE_STORE`.
- `GET /api/compare/quotes/{quote_id}` reads that store. Every returned quote is read back and matched before Node trusts the comparison.

| Node input/result | Steve contract / boundary |
| --- | --- |
| `exchange` | `exchange_before_spending` |
| `atm_withdrawal` | `withdraw_atm_cash` |
| `total_debit_budget`, MYR integer sen | `fixed_myr_budget`; the stated amount is **total debit including all fees**, not principal |
| `destination_target`, KRW integer won | `fixed_krw_target`; the stated amount is net received; Steve finds MYR principal and adds fees |
| `principal` | Unsupported: no equivalent Steve mode. Never reinterpret it as a budget or derive a target from it. |
| `myr_funding` | `MYR_BANK`; require principal, total debit and every separately debited fee in MYR |
| `krw_card` funding | Unsupported: the current engine still emits MYR principal/debits for `KRW_CARD`. Relabelling them KRW would change money. No FX conversion is invented. |
| Destination account | Explicit Node bookkeeping destination: KRW Cash for ATM, KRW Card for exchange. The upstream request has no destination-account field; this does not promise a provider payout route. |
| `card_network` | Lowercase Visa/Mastercard/UnionPay/Plus → Steve's canonical labels. ATM omission asks clarification. Explicit `unknown` omits the upstream filter, retains the original decision and renders unknown compatibility. Other networks are unsupported. |
| Location | Upstream has no user-location/filter field. Preserve `atm_info` seeded names, distances, map URLs and guide as metadata. Distances are seed attributes, not current-user geolocation or proof an ATM is open. |
| Rate | Upstream float is **KRW per 1 MYR**. Convert the JSON number's representation to a plain decimal string using Decimal, without applying it to amounts or claiming precision absent upstream. |
| Principal/net/total | Copy exact validated integer minor units; never recompute net, scale a quote or sort providers in Node. Validate exact requested target/budget and currencies. |
| `fees[].money` | Map to existing `fees[].Money`, retaining labels/order; every current MYR fee maps to `myr_funding` in `context.fee_accounts`. Preserve `original_display` in integration metadata; never debit both that KRW display and its normalized MYR amount. |
| Total reconciliation | Existing `quoteActivity` validates `principal + sum(separate funding-account fees) = total_debit` with integer arithmetic. Funds/reserve calculations still run only in Node. |
| Provider/quote identifiers | Preserve provider text and quote ID. Steve supplies no distinct stable provider ID; none is invented. Rank is the response array position, never Node price ranking. |
| Source/timestamp | Preserve Steve's original badge and full validated response in snapshot integration metadata. Public quote badges say **Simulated**, with Steve's source and timestamp retained. An upstream seeded `Indicative` label is not presented as live market data. Unexpected Live/User-Entered/User-Confirmed quote badges are rejected until a separate live-data contract exists. |
| Compatibility | Known network must appear in the returned ATM `supported_networks`. `compatible` means eligible in that **seeded dataset only**, with source/timestamp evidence; the Simulated badge and provider-verification caveat must accompany it. Unknown stays unknown. A contradictory known-network result is invalid. |
| Fee schedule | Response has fee amounts but no fixed/percentage/tier schedule contract. Set `context.fee_behavior=unspecified` and internal `fixed_fee_assertion=not_asserted`; current fee reconciliation is confirmed, future fixed fees are not. |

Shared Profile, Quote, Plan and LedgerEntry definitions are unchanged. Integration metadata (`atm_info`, raw upstream quote/request, rate direction/representation, retrieval time and storage boundary) lives in comparison wrappers and the existing snapshot `assumptionsJson`. Additive internal metadata includes `not_asserted` fee assertions and comparison-unavailable cards with optional safe error codes. The existing safe-principal service consequently requests a revised quote rather than subtracting an unconfirmed constant fee.

Example Agent request (all amounts are integer minor units):

```json
{
  "message": "Compare this cash target and preview the first option",
  "idempotency_key": "unique-message-key",
  "decision": {
    "objective": "atm_withdrawal",
    "amount": {"amount_minor": 100000, "currency": "KRW"},
    "amount_basis": "destination_target",
    "funding_account": "myr_funding",
    "destination_account": "krw_cash",
    "card_network": "visa"
  }
}
```

It reaches Steve as:

```json
{"objective":"withdraw_atm_cash","mode":"fixed_krw_target","amount":{"amount_minor":100000,"currency":"KRW"},"funding_source":"MYR_BANK","card_network":"Visa"}
```

Current first mapped quote excerpt (server-generated quote/snapshot/proposal IDs are omitted here):

```json
{
  "objective":"atm_withdrawal","mode":"fixed_krw_target","funding_source":"myr_funding",
  "provider":"KB Kookmin Bank Global ATM (Hongdae Branch)","rate":"312",
  "principal":{"amount_minor":32052,"currency":"MYR"},
  "fees":[
    {"label":"Home Bank Overseas ATM Fee","Money":{"amount_minor":1200,"currency":"MYR"}},
    {"label":"Local ATM Operator Fee","Money":{"amount_minor":1122,"currency":"MYR"}}
  ],
  "total_debit":{"amount_minor":34374,"currency":"MYR"},
  "net_received":{"amount_minor":100000,"currency":"KRW"}
}
```

The complete quote also includes the Simulated source/timestamp badge. The KRW operator-fee display (₩3500) is retained in upstream metadata; its normalized MYR 1122 sen is the sole account debit for that fee.

## Agent, reserve preview and explicit Save

The existing `compare_options` tool uses the configured adapter. Every valid option receives a Node reserve preview and owned immutable snapshot; `preview_quote` produces a trusted proposal without saving a pending plan. Snapshot metadata retains the requested network/basis and verified upstream quote. Source strings and provider descriptions remain untrusted data, not model instructions. Chat cannot post money or invoke Save.

Frontend flow is unchanged:

1. Read the returned structured cards and trusted proposal ID.
2. `POST /api/agent/sessions/:sessionId/proposals/:proposalId/preview` reads the stored selection and current Node balances/reserves.
3. Tap Save explicitly through `/save`, with `frontend_action=save_pending_plan`, a unique idempotency key and returned preview token. Include the existing reserve acknowledgement when required.

Same key/body replays the same pending plan. Changed preview context requires review; insufficient funds remains blocking. Saving changes no account, ledger or receivable. Completion still requires independently reported actual amounts and its explicit route. Card purchases are neither mapped to an owned-account exchange nor made postable.

For a lower safe amount, submit a **new** `total_debit_budget` request in MYR using a reviewed safe total budget. The adapter calls Steve again with the same objective/funding/network. New principal, every fee and net received all come from that response. Do not send an old safe MYR **principal** as an ATM KRW target; Steve has no principal request mode. A cash target may be revised only as an explicit KRW target. No automatic currency conversion or fixed-fee assumption is made here.

Steve's quote store is in memory and has no expiry/version API. Readback is checked during comparison, then Node stores immutable financial and provenance snapshots. Later preview/Save use those Node snapshots and current financial context, even if Steve restarts; Save does not claim a fresh offer or execute it. Fetch new quotes for current provider data. A restart or changed quote during initial readback fails that comparison. Multi-worker Steve deployments need shared quote storage/sticky routing before they can reliably satisfy readback.

## Failure bounds

Each HTTP operation has a configured 250–10000 ms timeout (default 5000), no redirects and at most 64 KiB before JSON parsing. Response schemas bound strings, integer amounts, four options and fee/ATM metadata. Empty options return a clear unsupported result; bad currencies, arithmetic, fields, network evidence, target/budget or quote-store mismatch never become trusted snapshots.

Quote POST allocates quote IDs, so it is not retried. Only quote GET receives one modest bounded retry for transport/timeout/5xx failures. HTTP bodies, URLs with secrets and private financial payloads are not logged. `COMPARE_CONFIGURATION_REQUIRED`, `COMPARE_UNAVAILABLE`, `COMPARE_TIMEOUT` and `COMPARE_INVALID_RESPONSE` produce recoverable comparison cards with `next_action=retry_later`; use a new message key after recovery (same message key replays its stored response). No fallback, plan save or posting follows failure.

## Frontend and later Split boundaries

There was no manual Node Compare route to replace. The existing manual frontend `seedCompare()` still calculates/sorts local fixtures; frontend screens are intentionally unchanged in this step. A follow-up should consume Node-validated comparisons/snapshots rather than duplicate Steve's calculations. Use returned ranking and quote badges, show seed-scoped compatibility/unknown states, and preserve the proposal preview/explicit Save flow. The merged frontend's own lint/build and complete UI journey are separate from these backend checks.

Steve's legacy Split allocation creates in-memory receivables and emits a `shared_expense_paid` bridge event immediately. The later pure preview route avoids those side effects. Node treats allocation as review-only and creates authoritative receivables with the single explicit financial confirmation. Wiring that legacy event would duplicate records or post before review.

Steve settlement marks an entire receivable settled and emits its full `locked_krw_cleared` amount alongside actual payment and target account, without Node's durable replay/partial-clearing workflow. The Python object is mutated before a bridge callback runs, so callback failure is not an atomic rollback. Stores/logs are process-local, and bridge events lack Node's durable idempotency binding and stable owner IDs. SGD references, account identifiers, receipt item schemas and payment ownership also require alignment. No Split/settlement route or callback is wired by this change; the existing Node explicit routes remain authoritative.

## Verification record

Verification uses separate FastAPI and compiled Node processes, a new temporary SQLite database with existing migrations/fictional seed, private temporary uploads, and an observation/fault proxy. Existing financial database configuration is overridden only in those processes. Original local `.env`/SQLite/receipt hashes are checked before/after; no Supabase migration, copy, reset, seed or financial request is run against the configured database.

Observed on **20 October 2026**, using the team default branch at `f073134` plus these uncommitted integration changes:

| Scenario | Observed result |
| --- | --- |
| Visa + KRW 100000 ATM target, MYR_BANK | Passed. Steve received canonical Visa and exact integer won. Node retained all four quote IDs and response order: KB Kookmin **34374** sen, Shinhan **34427**, Woori **34427**, CU **35157**. Principal + every fee reconciled. |
| Earlier regression reference | The reported Shinhan **33303** sen is not this dataset: current Shinhan principal is 32103 sen plus 1200 home-bank and 1124 normalized operator fee = **34427**. The current dataset also includes cheaper KB Kookmin. No answer was forced or hardcoded into the HTTP adapter. |
| UnionPay | Passed. Actual service filtered to Shinhan then Woori; both total 34427 sen. Node preserved the tied order. |
| Unknown network | Passed. No upstream network filter, four results, every compatibility state explicitly unknown. |
| English clarification | Passed. Ambiguous cash asks details; missing network asks network; a subsequent Visa-only turn retains amount and funding/routing context. |
| Fixed budget/target | Passed. ATM MYR 33303-sen budget was exact total debit for every result; KRW 100000 target remained exact received won. Exchange target also returned exact won, with seeded Indicative entries mapped to Simulated. |
| Reserve impact/revised amount | Passed. A 250000-sen budget triggered reserve warnings, with fee behavior unspecified and safe principal requiring a new quote. A new request using Node's safe **total budget** reached Steve and returned new quote IDs/amounts with no reserve breach. |
| Trusted proposal and snapshot | Passed. Source quote-store readback matched; snapshot retained full upstream quote/request and Visa decision metadata. Chat produced a proposal without creating a plan. |
| Explicit Save/duplicate/stale check | Passed. Preview plus Save created one pending plan; exact duplicate replayed that ID. Balances/ledger/receivables were unchanged. A changed temporary reserve invalidated the old preview and blocked a new Save. |
| Failure handling | Passed for outage, timeout, invalid JSON, >64 KiB, redirect, fractional money, inconsistent total, changed target and quote-store mismatch. Each returned a recoverable error with no new snapshot or financial change; POST was not retried. A transient quote GET retried once; subsequent service recovery succeeded. |
| Unsupported contracts | Passed. KRW Card funding and source-principal requests were explicitly rejected, not converted or guessed. |
| Regressions | Home and pending-plan assessment reads passed. Receipt review with a synthetic PNG remained explicitly Simulated. Explicit fixture mode returned fixtures with no Steve HTTP call. Existing isolated Node shared-expense demo passed without wiring any Python write bridge. |
| Real Groq | **Passed one limited journey** with configured `openai/gpt-oss-120b`, explicitly overriding inherited demo mode. Groq actually selected **`compare_options` and `preview_quote`**, both successful, and returned an HTTP-backed Simulated comparison and trusted proposal. Full financial snapshots were unchanged. Scripted adapter checks above are service/orchestration verification, not additional model evidence. |
| Checks | Node build, type-check and targeted backend-source lint (`node node_modules/eslint/bin/eslint.js src scripts eslint.config.js`) passed. Full root `npm run lint` reports **26 pre-existing frontend errors**; these are left visible, not disabled or fixed outside this scope. Python `pip check`, existing calculator self-checks and existing splitter self-checks passed in the separate environment. Node dependency versions, lockfile and shared models were unchanged. |
| Preservation | Original local `.env`, SQLite/sidecars and receipt files matched preservation hashes. No configured Supabase operation ran. All temporary databases/uploads/processes were removed. No permanent test suite was added. |

Verification corrections: Windows Python initially needed UTF-8 output for the KRW symbol. The temporary smoke script initially looked for a badge on `reviewed` rather than `extracted`; its cleanup also waited twice for an already-terminated process. Those verification-script issues were corrected and the full run repeated successfully. The merged static fixture labelled a 100000-won price as a 90000-won target; fixture labels were corrected while retaining a separate complete fictional 90000-won example. Root ESLint initially traversed both ignored operational helper scripts and the newly merged frontend and reported 45 errors. Private local/Python runtimes are now excluded as generated/non-source directories; frontend findings remain visible in full root lint. A temporary frontend exclusion used during investigation was removed. No lint rule or frontend check was disabled. Frontend's separate package checks were not run in this backend-only step.

This is one local seeded-service integration run and one real-model journey, not an exhaustive model, provider, deployment or concurrency guarantee. Live pricing/ATM compatibility, provider payout routes, user location, schedule/expiry metadata, real OCR/allocation, frontend Compare adoption and durable Split settlement integration remain unverified or unsupported as described above.

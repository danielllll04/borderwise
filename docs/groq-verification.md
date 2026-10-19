# Real Groq smoke observations — 19 October 2026

These are bounded manual observations against isolated seeded data, not a reliability guarantee or a test suite. Groq selected the tools listed below; the server supplied all financial cards. Compare, OCR, participant directory and allocation remained explicitly **Simulated**. No live ATM compatibility, price, image recognition or Steve calculation was verified.

## Configuration and isolation

The ignored local `.env` contained a key and model; there was no inherited demo override. Existing `dotenv/config` loading was used. The key was authenticated through Groq's model-list endpoint without printing it. The configured `llama-3.3-70b-versatile` was absent from that list, and chat requests returned HTTP 404 `model_not_found` (mapped by the app to safe HTTP 503 `AGENT_PROVIDER_UNAVAILABLE`). See [Groq's deprecations](https://console.groq.com/docs/deprecations).

Successful model calls used **`openai/gpt-oss-120b`**, confirmed available through the authenticated model list, with a process-only override. The smoke process forced `AGENT_PROVIDER=groq`, removed `AGENT_DEMO_FAILURE`, and explicitly selected `RECEIPT_PROVIDER=demo`. It did not edit `.env` or introduce a default model. To run the local backend with the verified model, update only `GROQ_MODEL` in the ignored `.env`, or launch from PowerShell with:

```powershell
$env:AGENT_PROVIDER = 'groq'
$env:GROQ_MODEL = 'openai/gpt-oss-120b'
Remove-Item Env:AGENT_DEMO_FAILURE -ErrorAction SilentlyContinue
npm run dev
```

Availability can change; check the current Groq model list before reusing a model ID. Keep keys server-side and never paste them into chat or frontend configuration. Leave `RECEIPT_PROVIDER=unavailable` for normal operation until a live adapter is connected; opt into `demo` only to exercise labelled fixtures.

Each run created an independent temporary SQLite file, deployed the existing migrations there, seeded fictional balances and created one pending plan for risk assessment before taking the financial baseline. Uploads used a separate private temporary directory, no public route, and a synthetic PNG. Both directories were removed after the run. The configured financial database was never opened by the smoke client. Its file and any SQLite sidecar hashes were compared before/after.

## Actual model selections

| Scenario | Observed Groq-selected tools | Result |
| --- | --- | --- |
| Read balances | `get_home` | Passed; balance card matched Home service values. |
| Ambiguous cash | `request_clarification` | Passed; asks amount, basis, funding account and required card network. |
| Complete ATM request missing network | `request_clarification` | Passed; only `card_network` missing. |
| Visa clarification across turns | `compare_options`, `preview_quote` | Passed; amount/routing retained, network reached Compare, Simulated ATM option and proposal returned, compatibility explicitly unknown. |
| Explicit unknown network | `compare_options`, `preview_quote` | Passed after instruction correction; compatibility explicitly unknown. |
| Simulated comparison, reserve preview and trusted proposal | `compare_options`, `preview_quote` | Passed after punctuation correction; Simulated options, reserve warning, authoritative preview and trusted proposal returned. |
| Chat Save/confirm after money proposal | `show_limitation` | Passed; no plan saved or confirmed, no financial mutation. |
| Current pending-plan risks | `read_pending_plan_risks` | Passed after completion/instruction correction; current assessment was “Would breach reserve”. |
| Receipt extraction | `extract_receipt_review` | Passed; review card labelled Simulated, with fixed-fixture OCR notice. |
| Ambiguous drinks assignment | `read_receipt_review`, `propose_receipt_allocation` | Passed; allocation card asks `beverage_participants`, no allocation calculated or financial records posted. |
| Resolved item assignments | `read_receipt_review`, `propose_receipt_allocation` | Passed; review-required Simulated allocation and server-owned receipt proposal ID returned. |
| Receipt chat confirmation | `show_limitation` | Passed financial-safety check; no expense or receivable posted. |

The ambiguous-drinks case explicitly excluded Tze Loon but did not identify whether the payer shared beverages. The server retained that ambiguity. The resolved case explicitly assigned food to all three, beverages to Daniel only, and the additional item to the payer. The adapter returned its static fixture shares; Groq did not calculate shares, and those results are not real OCR/allocation verification.

## Failures and corrections

1. The configured model returned `model_not_found`. A currently available model was used only for the verification process; local configuration still needs the model update above.
2. An unpaced run hit real HTTP 429 rate limits. The Agent unnecessarily continued inference after valid read/clarification results and could replace them with a provider error. It now stops once terminal cards/questions are ready. Subsequent manual requests were paced to respect the observed token quota. The existing bounded provider retry remains; this change adds no background retry system or fallback model.
3. The optional `card_network` request/context field now survives clarification, reaches Compare and is included in stored request metadata. The adapter can request it for ATM filtering through its optional policy hook. Fixture compatibility stays unknown. See the [proposed Steve addition](agent.md#proposed-internal-compare-addition-for-steve-card-network); agreed shared models were not changed in this step.
4. A real-model request containing a sentence-final `MYR 2500.` exposed a deterministic parser bug. The parser now accepts punctuation after an amount while still rejecting a malformed decimal instead of partially interpreting it.
5. The model initially chose a limitation for an explicitly unknown network. Its instruction now states that unknown is a valid answer: retrieve supported comparisons but preserve unknown compatibility.
6. A current-risk request initially stopped at `list_plans`. A plan list is not an assessment, so that completion shortcut is disabled for risk/assessment requests and the instruction names the required risk tool.

## Mutation boundary and remaining integration

Both the initial paced run and corrected money/risk recheck preserved exact row snapshots for Profile, Account, Activity, LedgerEntry, LedgerLine, Receivable, Settlement, SharedExpense, SharedExpenseAllocation, PlanRecord and WorkflowRequest across every chat turn. The configured database and any SQLite sidecar hashes remained unchanged in every run. Chat created only permitted session/history, quote/proposal and receipt-review metadata. Existing explicit frontend Save/completion/reviewed-split confirmation routes remain the only relevant action boundaries; no such action route was invoked by chat.

The initial paced run created one money proposal, one receipt draft and one receipt proposal across 12 turns. A fresh four-turn corrected money/risk recheck created two money proposals, with no financial mutations. Proposal IDs were checked against session-owned server records; the money proposal read route returned a non-stale result, and the financial preview check token matched a direct PlanService preview. The table combines the successful observed receipt/basic scenarios and the corrected money/risk recheck; it does not imply that the initially failed run passed or that every scenario was repeated after every instruction change.

Final `npm run build`, `npm run typecheck` and `npm run lint` passed. Local checks additionally verified optional adapter policy, network normalization/retention, explicit unknown values, rejection of compatibility assertions lacking evidence, sentence punctuation, malformed-decimal handling and absence of financial-write tools. Those local checks are not counted as model verification. Temporary verification scripts and temporary databases/uploads were removed; no test suite, additional shared-model change or dependency upgrade was introduced. Sanitized status/tool-name reports are kept only under ignored `.local/groq-smoke/`; they contain no keys, model prose, hidden reasoning, prompts or tool arguments.

Steve still needs to agree the internal network vocabulary/policy and Compare evidence/validity contract, supply real provider prices and ATM compatibility/filtering, and connect OCR, stable participant IDs, receipt review and allocation contracts. Frontend work still needs typed financial/review cards, Simulated and unknown-compatibility display, structured clarification, owned references/version refresh, stable retry keys and separate explicit Save/confirmation actions with review/acknowledgement/staleness handling. Authentication, card purchases, cross-currency receipt payment and existing-payment linking remain unsupported. No frontend/Steve end-to-end integration is verified by these model calls.

The later repository synchronization preserved Steve's root Python schemas/calculator/seed files and the separate frontend branch. They were not used by these Groq smoke runs and are not connected to the TypeScript ports. See the [handover mapping notes](agent.md#proposed-internal-compare-addition-for-steve-card-network) before integrating them; their presence does not turn the Simulated adapters into verified live integrations.

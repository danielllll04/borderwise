# Agent frontend integration

Implemented after Compare/Home checkpoint `4195fea` on `codex/frontend-compare`. The initial frontend step changed its API facade/types and Agent components/state only. Existing Home, manual Compare, shared cards/completion form, financial models, migrations, dependencies, Split and translations are preserved. The later [pagination hardening checkpoint](agent-risk-pagination.md) adds a constrained backend tool wrapper and recovery metadata and saves this combined Agent work for draft PR review. The observations below record the initial browser run separately.

## Existing routes and ownership

`api.agentBackend` mirrors [the existing Agent API](agent.md), separately from the older mock contract. It uses the same safe public API configuration and same-origin proxy as Compare/Home. Credentials stay server-side. Explicit mock mode reports the connected Agent unavailable; no frontend scripted answer or fixture fallback remains.

| Method/path | Frontend use |
| --- | --- |
| `POST /api/agent/sessions` | Create an owned demo session. One shared creation promise prevents StrictMode duplicate creation. |
| `GET /api/agent/sessions/:sessionId` | Resume the tab's last session or an explicitly entered session ID; read provider availability. No session-list endpoint is invented. |
| `GET /api/agent/sessions/:sessionId/history?limit=20&cursor=…` | Load persisted user/assistant messages in ascending integer-ID order. Read up to 50 pages per refresh, then offer Load more history. Deduplicate by message ID. |
| `POST /api/agent/sessions/:sessionId/messages` | Send every typed message and starter prompt, with a retained request key. Selected comparison options send an owned `snapshot_id`, never mislabel it as a proposal ID. |
| `POST /api/agent/sessions/:sessionId/proposals/:proposalId/preview` | Explicitly re-preview the trusted stored proposal. Read the actual `{selection, preview}` wrapper. |
| `POST /api/agent/sessions/:sessionId/proposals/:proposalId/save` | Explicit Save only, with `frontend_action=save_pending_plan`, reviewed token, stable `agent-frontend-save:<proposal UUID>` and applicable reserve acknowledgement. |
| Existing Home plan reads / completion-preview / confirm | Fetch the current owned plan/accounts and open the unchanged `PlanCompletion` component. Unsupported objectives/accounts cannot use completion. |
| `GET /api/plans/assessments` | Explicit read-only Refresh current assessments in risk cards, independently of any model-selected history page. Uses Home's facade; no financial arithmetic or new route. |

Chat never calls Save, confirm, cancel or unrestricted posting. Only explicit buttons invoke those existing frontend-action boundaries. There is no Agent cancellation action in this step. Home completion performs its own current preview, actual-input confirmation, reserve acknowledgement, atomic posting and stable-key retry flow. Backend ownership/validation/idempotency remain authoritative.

## Rendering and state

The existing chat bubbles, coral composer, starter chips, navigation and branding are retained. Starter prompts now go to Node; the receipt demonstration is replaced with a pending-risk starter because receipt UI remains deferred. No translation changes or automatic language-toggle behavior is added.

- Home balance cards reuse `HomeSummary`; comparisons reuse `ComparisonCard`; amounts and badges reuse `kit` formatting. Backend order, fees, quote mode and source/compatibility evidence are displayed without recalculation. Seeded quotes remain **Simulated**, even with real Groq.
- Clarifications render backend-defined questions; network answer buttons send normal backend messages. Proposals and reserve cards display Node amounts, safe total debit and current-preview requirements, including nullable reserve checks and separate-account MYR warnings. No local safe-principal/fee/FX calculation remains.
- Plan/ledger snapshots and current risk cards are supported. Unavailable risk reads are explicitly handled instead of assuming `items` exists. Receipt/allocation/other unsupported cards show a constant safe explanation with no posting action or raw data dump.
- Historical messages/cards carry timestamps and snapshot labels. A history refresh does not replace the separate proposal/action state or re-enable an already saved proposal. Risk refresh labels a fresh Node read separately from the historical model-selected page; failed reads retain labelled prior values.

Tab-scoped `sessionStorage`, namespaced to the configured public API root, holds session IDs, unresolved user-message payload/key, proposal Save token/acknowledgement, saved plan IDs and known resolved-plan IDs. No Groq key, database credential, hidden prompt, raw model answer or balance/quote cache is stored there. These are workflow details, not production authentication. Per-session records retain unresolved actions and saved state when switching away and explicitly resuming. Backend history remains the conversation source of truth.

Submitting an action first retains its retry details; unavailable browser storage blocks that first send/Save. Ambiguous network failures retain the identical body/key across modal close, navigation and page reload. Definitive request validation rejects restore the text for editing. Provider failures with a structured `AgentMessageResult` are completed stored turns, including HTTP429: replay would reproduce that failure, so a fresh provider request is a separate labelled new-turn action, never an implicit new-key retry. Unknown 429/transport/in-progress outcomes keep the original key. In-flight refs prevent repeated clicks before React updates.

Save success is recorded independently of history/Home refresh or browser-state cleanup errors. A separate recovery card can reopen an unresolved Save even when history fails. Known saved IDs hide duplicate Save actions. `bump()` refreshes shared Home/plans reads on Save/completion; later read failures do not undo success or encourage a second debit. Completion keeps Home's existing in-memory actual-attempt handling and deterministic per-plan key; after a full reload read current plan status before entering new actuals.

## Actual browser observations (20 October 2026)

Three real loopback processes (Steve/FastAPI, Node, Vite) used disposable migrated/seeded SQLite and private temporary uploads. The Node process explicitly selected `AGENT_PROVIDER=groq`; inherited demo settings were not used. The configured server model was **`openai/gpt-oss-120b`**. Groq credentials were present and stayed inside Node; neither Python nor Vite child environments received them. No configured Supabase request, migration, reset or reseed was performed. Verification logs retain tool names/outcomes, IDs, request hashes and counts, not credentials, user prompts or hidden/model prompt content.

| Scenario | Observed |
| --- | --- |
| Real balance read | Groq selected `get_home`. UI showed MYR 4021.33, KRW Card 218000, KRW Cash 80000, stated MYR 2000 reserves and Node safe total MYR 2021.33, with provenance and currencies separate. |
| Ambiguous cash / missing network | Groq selected `request_clarification` on an ambiguous cash message and again for a complete KRW 100000 ATM request missing its network. Backend questions and Visa/Mastercard/UnionPay/Unknown controls rendered. |
| Visa comparison | Visa-only clarification preserved the session's amount/funding. Groq selected `compare_options` and `preview_quote`. UI displayed Steve's exact target ranking KB Kookmin 34374 sen, Shinhan 34427, Woori 34427, CU 35157, with KRW 100000 received, exact fee lines and Simulated seed-scoped compatibility. |
| Lost message response / full reload | A successful Visa response was dropped after persistence. Reload restored the session/history and exact pending request. Retry reused the same body/key; the original turn replayed with no additional model tools/messages. |
| Reserve budget | Groq selected `compare_options` and `preview_quote` for total MYR 2500 budget. UI preserved Steve's descending net order (KB 772755, Woori 772157, Shinhan 771511, CU 763867 KRW) and Node projected MYR 1521.33 / MYR 478.67 shortfall. No plan existed after chat. |
| Explicit Save | Fresh trusted proposal preview showed Save disabled until reserve acknowledgement. Explicit Save created one pending plan, without financial changes. Its successful response was dropped; reload with forced history503 still exposed a recovery card. Double-clicked retry used an identical body/key and returned that same plan. Success stayed visible while optional reads failed. |
| Home / action persistence | Restored reads showed the saved plan on Home, actual Above reserve separately from Would breach reserve forecast. Navigating back, creating another session, explicitly resuming the original and reloading history retained saved-plan state and hid its Save action. |
| Rate limit | A verification-only HTTP429 rejected one message before Node accepted a turn. UI retained its exact payload/key; retry completed one real Groq turn. This injection is **not** an observed Groq provider rate limit. Structured persisted-provider-error UI follows the inspected error-envelope contract but was not separately forced in this browser run. |
| Pending-risk model limitation | Groq selected `list_plans` and `read_pending_plan_risks`, but incorrectly used the pending plan ID as a pagination cursor and returned an empty page. An explicit first-page follow-up repeated that mistake. The UI does not claim the page proves no global risk. The new explicit current-assessment read returned Would breach reserve / MYR 478.67; injected read503/recovery was recoverable. This successful direct Node read is **not** a corrected model-tool result. |
| Completion boundary | A saved-plan action opened Home's unchanged actuals/account/fee/time form. Completion preview returned Node impacts/differences/reserve warning and left Confirm disabled without actual confirmation/acknowledgement. Not Completed Yet left the plan pending and financial records unchanged. No actual completion was posted during this Agent run; financial-posting/replay evidence belongs to the earlier [Home verification](home-integration.md). |
| Manual Compare regression | Existing manual Visa/KRW100000 target still returned the exact same four providers/ranking/amounts and Simulated provenance through Node/Steve. No additional plan was saved there. |

Final observed state before cleanup: seven completed real-Groq turns, fourteen persisted messages, one pending plan, and unchanged full financial fingerprints (accounts, activities, ledger entries/lines, receivables and settlements). The additional explicit new session and manual Compare's metadata session account for three sessions; message retries created no duplicate turns. There were no completion/cancellation/posting calls from chat. The one-off verification environment is removed after checking.

Verification correction: the initial cash starter sent `KRW 100,000`, which the existing conservative backend parser rejected before model/turn creation. The sent text now uses `KRW 100000` while the button keeps human-friendly punctuation. Definitive validation failures restore editable input rather than trapping the user in an ambiguous retry. No backend parser/financial calculation was weakened to accept it.

## Checks, limits and remaining work

Node build/type-check and backend/changed-source ESLint pass. Frontend oxlint and direct Vite production bundling pass, with existing unrelated oxlint warnings. Full frontend `npm run build` still fails on the same **six** calendar/resizable type errors. Root lint's previous **20** errors are now **14**: replacing Agent removed its six existing errors; the remaining untouched mock, use-toast, Split, ctx, kit, shared and Tailwind failures remain visible. No rule/check was disabled or dependency upgraded.

The risk-tool mistake observed above is fixed by the subsequent [server-managed continuation checkpoint](agent-risk-pagination.md): raw model cursors are retired; invalid/stale references restart with genuine first-page results and visible recovery metadata. Real Groq subsequently completed the original request and valid continuation. The explicit current-read fallback remains. These initial browser results and later API/model results are local smoke checks, not comprehensive model reliability evidence.

Receipt editing/uploads, Split/settlement UI, Chinese translation work, production authentication/deployment, live prices/ATM compatibility, real OCR and bank execution remain deferred. Unsupported payment restrictions remain. Existing backend dependency findings remain documented in [dependency-audit.md](dependency-audit.md); no new audit/remediation claim is made. Private financial configuration/files and Compare/Home source are preserved. See [integration progress](integration-progress.md) for resume commands.

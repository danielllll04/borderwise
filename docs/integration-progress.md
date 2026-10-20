# Frontend integration checkpoint

## Phase 5–7 continuation review (20 October 2026)

The worktree was checked before synchronization and was clean on `backend/money-ledger-agent`. `git fetch origin backend/money-ledger-agent` then showed `HEAD` and `origin/backend/money-ledger-agent` both at `3177946` (`0 0` divergence), so no pull was needed. No application code or dependency was changed in this continuation; the only intended change is this evidence update.

### Phase 5 — receipt, allocation, confirmation and repayment

The current Phase 5 section above already contains the complete observed isolated HTTP/browser journey. It remains the authoritative detailed result: Steve's image OCR returned the fixed **Hongdae Samgyeopsal House** sample with an explicit **Simulated** badge/fixture notice; a user correction created a new review version; Node validated the KRW 50,000 allocation (payer KRW 15,000, Daniel KRW 21,000, Tze Loon KRW 14,000); only the documented reviewed-proposal confirmation posted the single full-bill debit; receivables were not income; and partial/full repayments and exact-body replays produced no duplicate posting.

An additional isolated HTTP replay was attempted using a newly migrated/seeded temporary SQLite database, private temporary receipt storage, Steve at loopback `:8011`, and the compiled Node server at loopback `:3011`. Extraction, review correction, allocation, confirmation/replay, and the three documented settlement confirmations all returned success before the harness's final reporting assertion failed because its `T` temporary-directory variable was placed after rather than before the `node` command. The temporary database and processes were removed by its trap. **Result: FAIL (harness/reporting defect only); do not count this run as fresh accounting proof.** No financial data outside the disposable database was touched and no financial rule was changed to make the run pass.

The repository's retained isolated regression command was then run successfully:

```text
npm run demo:split
```

It confirmed a simulated KRW 50,000 shared expense: one KRW Card debit of 50,000, personal expense 15,000, receivables 21,000 and 14,000, followed by a 10,000 KRW settlement that credited the Card and reduced only the receivable. The output contained a `shared_expense` entry followed by a `settlement` entry, not income. This is a narrower fixture regression than the prior full Phase 5 HTTP/browser observation.

Pending-plan follow-up remains a read-only `GET /api/plans/assessments` instruction after receipt confirmation/settlement. The supported receipt fixture is paid in KRW, while the implemented reserve calculation is MYR Funding-only; it must not manufacture a causal reserve warning for a KRW receipt. Earlier documented observations showed no false reserve claim. A scenario that connects a receipt payment to a MYR reserve impact is not supported by the same-currency KRW receipt contract and is **NOT RUN** rather than inferred.

### Phase 6 — security, reliability and consistency

| Check | Result | Actual outcome |
| --- | --- | --- |
| Financial-write route audit | PASS | `rg -n "app\\.(post|patch|put|delete)\\(" src` identified the narrow Node confirmation routes. Receipt extraction/allocation are review/preview only; settlement writes only through `/api/receivables/:id/settlements/confirm`. |
| Python/Node boundary audit | PASS | `src/receipts/steve-adapter.ts` references only `/api/split/allocate/preview`; no Node/frontend reference to Python's legacy allocation or settlement writers was found. |
| Pending-plan mutation boundary | PASS | receipt/settlement results expose a read-only assessments follow-up; no assessment route posts balances or plans. |
| Idempotency/retry boundary | PASS (prior full observation) | durable receipt confirmation and settlement keys/replay paths remain documented above; retained Split fixture also verifies one bill posting/one partial settlement. The additional fresh HTTP harness is not counted because of its reporting failure. |
| LLM authority boundary | PASS | Agent financial mutations remain absent; receipt confirmation is an explicit frontend route and allocation is schema-validated preview data. |
| Frontend secret scan | PASS | `git grep` over `frontend/src` and Vite configuration found no server credential variable or secret. A broad scan's SVG `key` attribute was a false textual match. |
| Simulated/indicative labelling | PASS | OCR, Split fixture, calculation and budget output explicitly identify simulated provenance. No live OCR, banking, ATM availability or FX claim was made. |
| Agent/manual consistency | PASS (prior Phase 5 observation) | Agent/Split, Home and authoritative Node receivable/ledger reads were previously compared on the same disposable backend state. No new browser run was performed in this continuation. |

Known security limitation remains: authentication/multi-user isolation is absent and these local APIs must stay loopback-only. This is not a production authorization review.

### Phase 7 — regression/build verification

| Command | Result | Outcome |
| --- | --- | --- |
| `npm run build` | PASS | Backend TypeScript build completed. |
| `npm run typecheck` | PASS | Completed with no TypeScript diagnostics. |
| `npm run lint` | PASS | ESLint completed with no errors. |
| `cd frontend && npm run build` | PASS | `tsc -b && vite build` completed. |
| `cd frontend && npm run lint` | PASS with 10 existing warnings | Oxlint reported no errors; warnings are Fast Refresh/hooks/carousel advisory warnings. |
| `.venv/bin/python -m compileall -q main.py schemas.py steve_router.py steve_calculator.py steve_splitter.py` | PASS | Python modules compiled. |
| `.venv/bin/python steve_calculator.py` | PASS | All deterministic calculator self-tests passed. |
| `npm run demo:split` | PASS | Isolated temporary SQLite Split/partial-settlement regression passed. |
| `npm audit --omit=dev --audit-level=high` | FAIL / 3 high | Prisma 6.19.3 → `@prisma/config` → `deepmerge-ts <8`; npm's offered remediation is the breaking Prisma 7.10.1 upgrade. Not applied. |
| `cd frontend && npm audit --omit=dev --audit-level=high` | PASS / 0 | No production frontend vulnerabilities reported. |
| `git diff --check` | PASS | No whitespace errors. |

No defect was fixed in this continuation, so no new regression test was added. The stored Phase 5 observations remain the complete integration evidence; the new temporary HTTP harness needs a small command-scoping repair before it can be counted as repeatable fresh proof. Existing Phase 4 limitations remain unchanged: grouped `₩100,000` parsing rejects with `INVALID_AMOUNT_TEXT`, KRW Card-funded ATM quotes are unsupported by the MYR-based representation, and Seoul/nearby wording is not used for pricing.

Status on 20 October 2026: **Compare/Home checkpoint `4195fea` and Agent/pagination checkpoint `679b4ad` remain preserved on `codex/frontend-compare`. This frontend checkpoint adds completed Split and Agent receipt/repayment adoption to draft PR #5.** Verification results below are reused for the authorized commit/push; tests are not rerun. No merge or further feature work is performed. The observed receipt/repayment checks use disposable data only.

## Completed

- UI finishing task 2: ATM & Alerts now reads Node `GET /api/atms` (the existing validated Compare adapter, illustrative KRW 100000 target/MYR funding, no session/proposal writes) and `POST /api/alerts/check` (bounded, validated Steve `/api/alerts/check`). Locations/distances, pricing, history, trigger state and estimates come from the backend, labelled Simulated; no live location/rate or notification subscription is claimed. Map links allow only HTTPS Naver/Kakao map hosts. Loading, empty, unavailable and retry states reuse existing components. Server URL/timeout reuse `STEVE_COMPARE_BASE_URL`/`STEVE_BASE_URL` and `STEVE_COMPARE_TIMEOUT_MS`; no browser secrets or financial posting routes are added. Runtime/browser verification is intentionally excluded; build/lint remain scheduled once after implementation.

- UI finishing task 1: Chinese interface labels, statuses, review/confirmation forms, notices and starter prompts now use the existing language setting. Display translations preserve user messages, provider names, provenance, IDs and financial payloads. Chinese read-intent routing and explicit currency integer words are supported conservatively; approximate, signed and abbreviated ambiguous amounts still require clarification. No browser tests/demos or dependency upgrades are run in this finishing step. Build/lint will be run once after all three requested implementation tasks; until then these new changes are statically reviewed only.

- Manual Compare calls Node's validated shared Steve comparison boundary, preserving objective, amount mode, currency, funding account and card network. It displays backend ranking/amounts/fees/compatibility/provenance and uses trusted proposals, current reserve preview, explicit acknowledgement and Save. Saving creates a pending plan with no balance/ledger effect.
- Home reads Node profile, separate MYR/KRW balances, stated reserves, ledger, pending plans and independent risk assessments. Actual MYR budget status stays distinct from forecast pending-plan risk. Backend source badges remain visible.
- Actual completion collects principal, individually paid fees, amount received, supported owned accounts and completion timestamp. Existing Node preview returns quote differences/account impacts/reserve warnings. Only explicit confirmation with applicable acknowledgement posts actuals. Stable keys and identical-body retries preserve backend idempotency.
- Not Completed Yet leaves pending state and financial records unchanged. Cancellation changes plan status only. Successful posting stays successful if optional refresh reads fail; Home labels cached data and provides read-only recovery.
- Agent now creates/resumes Node sessions, loads persisted history and sends every message/starter to Node. It renders backend clarifications, balances, ranked Simulated comparisons, reserve previews, trusted proposals, plans/ledger and pending-plan assessments. Explicit preview/Save uses trusted proposal IDs; supported completion actions reuse Home's existing form. Session/action retry state is independent of history reloads, and shared Home/plans reads refresh after successful actions.
- Split and Agent share private image upload, editable versioned receipt review, stable-ID participant/item assignments, authoritative allocation cards and explicit reviewed-bill confirmation. Split reads Node debts/history and confirms partial/full repayments with independently entered original debt clearance and actual money received. Tab-scoped exact attempts survive reloads; optional refresh failures do not undo successful posting. Source provenance remains visible, including Simulated sample OCR. No frontend allocation/FX/reserve calculations or Python financial routes are used.
- Existing branding/layout, Home/Compare source, shared server contracts, database migrations and dependencies are preserved. Node remains the sole financial writer. Chat cannot save, confirm, cancel or post financial activity. Translation, real OCR and production authentication remain deferred.

## Evidence and handover

- [Manual Compare: routes, configuration, UI verification and retry handling](manual-compare.md)
- [Home: existing routes, actuals, current budget versus forecast, UI verification](home-integration.md)
- [Steve comparison adapter and backend ownership](compare-integration.md)
- [Plan preview/Save/completion/cancellation contracts](priority-3.md)
- [Pending-plan risk and refresh semantics](pending-plan-risk.md)
- [Agent frontend implementation, actual browser/model observations and remaining work](agent-frontend.md), [Agent backend contracts/configuration](agent.md), [earlier real-Groq observations](groq-verification.md)
- [Hardened risk pagination, issued continuation references and verification](agent-risk-pagination.md)
- [Receipt review](receipt-review.md), [authoritative settlements](settlements.md), [shared-expense confirmation](shared-expenses.md)
- [Dependency findings and deferred maintenance](dependency-audit.md)
- [Existing Supabase installation and preservation/rollback guidance](supabase.md)

Observed browser verification used actual Python/Node/Vite processes and disposable migrated/seeded SQLite/private storage, with no configured Supabase access. Visa/UnionPay comparison, revised quotes, explicit reserve acknowledgement, Save and Home display were exercised. Save, completion preview, Not Completed Yet and cancellation left financial snapshots unchanged. Actual completion posted MYR 2500 principal plus separate MYR 10/MYR 20 fees and KRW 800000 received once; a deliberately dropped response and repeated retry clicks returned the same posting. Forced refresh failures did not misreport the successful posting. Restored reads showed MYR 1491.33, KRW Cash 880000 and unchanged KRW Card 218000. Full per-scenario observations are in the linked guides. These are local integration observations, not live bank execution or additional real-model verification.

The subsequent Agent browser check explicitly used real Groq **`openai/gpt-oss-120b`** with fresh isolated data. Actual selected tools included `get_home`, `request_clarification`, `compare_options`, `preview_quote`, `list_plans` and `read_pending_plan_risks`. Visa results matched Steve's four-provider ranking; MYR2500 guidance showed Node MYR1521.33 projected balance and MYR478.67 shortfall. Dropped-message/reload replay created no duplicate turn. Explicit acknowledged Save, dropped reply, reload and double-clicked original-body retry produced exactly one pending plan visible on Home, with no financial-row changes. Optional read failures did not undo success. Completion preview/Not Completed Yet reused Home's form without posting. Manual Compare and session create/resume were exercised. The run finished with seven real-Groq turns/fourteen messages and one pending plan; all financial fingerprints matched the starting seed. Simulated HTTP429 and read outages were fault injections, not Groq provider evidence.

**Pending-risk pagination fixed in the subsequent checkpoint:** the initial model requests copied a plan UUID into a database cursor and skipped it. The tool now defaults to page one and accepts only opaque server-issued references scoped to its owned session/latest flow, page size, financial context and expiry. Invalid/stale input restarts through the real assessment service with a recovery notice. Existing execution metadata retains the mapping; no migration or shared financial model change is needed. The direct frontend refresh fallback remains. See [contracts and exact observations](agent-risk-pagination.md).

New isolated checks covered seven plans as 3/3/1; invented/legacy/foreign/expired/superseded references; missing boundaries; and stale financial context, without financial mutations. Real Groq `openai/gpt-oss-120b` completed the previously failing request, a valid next page and another fresh first page: **5/2/5 plans**, all service-backed. An extra comparison hit actual provider HTTP429 after that success and is not counted as passed. Separate Steve/Node HTTP regressions verified Visa prices, trusted Agent Save replay and matching Home/risk reads with eight pending plans (seven setup fixtures plus one explicit Save). All financial fingerprints matched. Earlier browser observations above remain evidence for the frontend journeys; these hardening checks are API/model checks, not a new full browser run.

## Checks and known errors

Checkpoint checks were rerun without dependency upgrades or database operations:

| Check | Result |
| --- | --- |
| Root `npm run build` | Pass: Node backend build only. |
| Root `npm run typecheck` | Pass: Node/backend scripts. |
| Backend and changed-source ESLint | Pass; command below. |
| Frontend `npm run lint` | Pass (oxlint), with existing warnings in unrelated files. |
| Frontend direct Vite production bundling | Pass; this does **not** run or replace TypeScript checking. |
| Frontend `npm run build` (`tsc -b && vite build`) | **Fails** on six pre-existing type errors, listed below. Full frontend build does not pass. |
| Root `npm run lint` | **Fails** with 13 unrelated errors: the Agent step removed six of the original 20 and this Split replacement removed one. No checks/rules were disabled. |

The six frontend errors are `src/components/ui/calendar.tsx:85` (unsupported `table` class key) and `src/components/ui/resizable.tsx:9,10,25,28,40` (removed PanelGroup/PanelResizeHandle exports). The remaining 13 root lint errors are in `frontend/src/api/mock.ts`, `hooks/use-toast.ts`, `ui/ctx.tsx`, `ui/kit.tsx`, `ui/shared.tsx` and `frontend/tailwind.config.js`. They are not new integration regressions. Resolve these in a separate scoped maintenance change; do not hide them by disabling checks.

Other limitations:

- Compare pricing and network evidence are seeded **Simulated**. Unknown compatibility remains unknown; no live rates/ATM availability is claimed. The engine rejects KRW-funded pricing/source-principal requests and card purchases.
- Home completion supports the existing exchange/ATM restrictions only. Actual money/fees are user-reported, not bank-verified. The frontend does not calculate FX, fees or reserves.
- Ambiguous completion bodies survive modal/tab navigation in memory, but not a full page reload. After a reload read Node's recorded status before re-entering actuals; server idempotency/terminal-plan guards remain authoritative.
- Authentication is absent; all local APIs use the seeded demo profile. Keep servers on loopback. Deployment/CORS, multi-user isolation, live bank execution, Chinese translation and real OCR remain outside this step. OCR still returns **Simulated sample output**. Tab-scoped Agent/receipt/repayment state is not production user authentication. Closing/clearing the browser tab can remove recovery metadata; Node history and idempotency remain authoritative. Do not re-enter an uncertain repayment as a new action without checking Node's history.
- The last backend dependency audit retains three high package findings through Prisma configuration's deepmerge-ts dependency. Frontend dependency remediation is not included; unchanged dependencies are not a vulnerability-free claim. See the dated audit scope in the linked report.
- Private `.env`/credentials, databases/sidecars, uploads, temporary checks, node_modules and build output are excluded from this checkpoint. The base repository already tracks 2765 files under a legacy Linux `.venv`; those existing team files are unchanged here. The ignore rule prevents new runtime files but cannot untrack historical ones. Removing that legacy runtime belongs in a separate repository-hygiene change.

## Receipt/Split frontend: observed results (20 October 2026)

`frontend/src/api/split-types.ts` mirrors existing Node wrappers, not new shared models. The API facade uses the existing same-origin configuration; image uploads send raw PNG/JPEG, never paths or public upload URLs. `ReceiptReview` is shared by Split and Agent; `Repayment` reads the authoritative debt and paginated settlement history. Existing `kit` cards, badges, formatting and modal styling are reused. No backend route, migration, dependency or translation changed.

Review always refreshes the current owned draft/proposal. Corrections retain the immutable original extraction, increment the expected version and clear earlier assignments/proposals. Missing assignments render Node clarification instead of invented shares. Unsaved local differences cannot authorize an older allocation. The frontend renders Steve's calculated shares and Node's reconciliation; only explicit `confirm_reviewed_split` with both acknowledgements can post. Same-currency/current-user-payer/new-payment restrictions remain. Agent messages carry an explicitly selected draft/version, refreshed before a new turn; the visible receipt context can be cleared. Read-only starters clear that context. Receipt/allocation cards reopen the shared review, and durable committed receipt events are paginated independently from messages.

Before either financial confirmation, the exact body/key is written to tab-scoped sessionStorage. Uncertain attempts lock inputs and expose only an identical-request recovery button, even if reads fail or the page reloads. Known success is stored/displayed before optional refresh; replay does not start another payment. Receipt edits/allocations have version checks rather than financial idempotency keys: after an ambiguous response, refresh the current draft and explicitly review/reallocate. A lost upload response may require a fresh upload, which has no financial effect. Original images are private server storage; browser workflow state contains review/recovery data and no credentials. Successful actions invalidate shared Home/ledger/plan reads; mounted Agent risk cards refresh through the existing read-only fallback.

Actual Python, Node and Vite processes ran on alternate loopback ports with newly migrated/seeded disposable SQLite and private temporary uploads. The configured Supabase installation was never opened. Existing `.env` and local `prisma/dev.db` hashes matched the earlier preservation baseline. Temporary databases, images and service processes were cleaned up. No permanent test suite was added.

| Browser scenario | Observed result |
| --- | --- |
| Split upload/extraction | Fictional PNG reached Steve's actual `/api/split/ocr/image`. Immutable source clearly said **Simulated**, fixed sample, no image-content interpretation. |
| Corrections and ambiguity | Merchant correction retained original source; omitted drinks assignment returned clarification, no proposal or Python allocation request. Explicit stable-ID assignment returned KRW 15000 payer / 21000 Daniel / 14000 Tze Loon; Node reconciliation validated. |
| Version invalidation | Another correction removed confirmation controls and invalidated the earlier proposal. A separate API attempt against it returned `RECEIPT_VERSION_STALE`. The current version was reassigned/reallocated through the UI. |
| No financial posting during review | Whole financial-row fingerprints matched before/after extraction, edits, incomplete assignments, both allocation previews and stale rejection. |
| Explicit bill/replay | Full KRW 50000 debit once, personal expense KRW 15000 and two linked receivables KRW 21000/14000. Deliberately dropped committed reply, browser reload and original-confirmation retry returned the original activity; whole financial fingerprint unchanged on replay. |
| Partial repayment/replay | KRW 6000 debt clearance and actual KRW 6000 received into KRW Cash; outstanding KRW 15000. Dropped committed reply, reload and original-request retry created no second settlement. A forced read outage still displayed posting success; read-only recovery restored history. |
| Cross-currency final repayment | Independently entered KRW 15000 cleared / MYR 48.50 received into MYR Funding. Outstanding became zero; original debt remained KRW 21000. No FX was inferred. |
| Same-currency full repayment | KRW 14000 cleared / actual KRW 14000 received into KRW Card; the second debt became settled. Both debts/history remained readable through the Settled filter. |
| Agent receipt cards | Actual Node responses from the explicitly **scripted demo model** rendered receipt-read and allocation-clarification cards, retained selected draft/version across turns, reopened review and displayed committed receipt history. A fresh isolated follow-up confirmed that reopening the allocation card retained all three explicitly selected stable participants and its missing-assignment questions; the financial fingerprint was unchanged and no confirmation request was sent. These runs did not call Groq and are not new real-model verification. |
| Existing screens | Agent balance read, Home balances/ledger/current budget and pending forecasts, and Steve Visa manual Compare worked. Explicit Compare Save created one pending plan with an unchanged financial fingerprint. |
| Final accounting boundary | Six successful confirmation requests represented four distinct bodies: one bill and three repayments. Final activity count 8 (seed 4 + bill 1 + repayments 3), ledger entries 10, settlement rows 4 including the seed, income rows unchanged at 1. Final MYR Funding 406983 sen, KRW Cash 36000, KRW Card 232000. Python receivable store stayed empty; observed calls used only OCR/allocation preview and Compare reads, never legacy financial routes. |

Not newly exercised here: real-Groq receipt decisions, large-page UI pagination, every upstream failure mode, multi-browser races or production/authenticated storage. Earlier backend concurrency/adapter-failure evidence remains in [receipt-review.md](receipt-review.md) and [settlements.md](settlements.md); it is not relabelled as fresh browser evidence. Seeded Compare and OCR remain Simulated. Repayment fees/FX snapshots, other payers, existing-payment linking, production authentication and translation remain unsupported/deferred.

Next task requires another instruction: review this frontend checkpoint and choose the next maintenance/integration work. The user authorized committing/pushing this completed step and updating draft PR #5 using the completed checks. No merge or additional integration is performed.

## Phase 0 integration discovery (20 October 2026)

### Repository state

- Current branch: `backend/money-ledger-agent`.
- `HEAD`: `4328a3a`, merge pull request #5 from `codex/frontend-compare`.
- `HEAD` matches `origin/backend/money-ledger-agent`, which is also `origin/HEAD`; no pull was needed.
- The worktree was clean before this Phase 0 update. No application logic was changed.
- PR #5's integration commits are visible in history: `4195fea` Compare/Home, `679b4ad` Agent/pending-risk, `1d69afe` Split/receipt/repayment, `d57f633` Chinese/global localization, and `69836ad` ATM/alerts.

### Integration map

| Surface | Entry point | Authoritative connection |
| --- | --- | --- |
| Frontend | `frontend/src/main.tsx`, `frontend/src/App.tsx` | Vite React app; `frontend/src/api/api.ts` selects live or mock facades. |
| Node server | `src/server.ts` -> `src/app.ts` | Fastify on `HOST`/`PORT` (default loopback `:3000`); Node owns financial writes. |
| Node Home/plans | `src/app.ts` | `/api/profile`, `/api/balances`, `/api/home`, `/api/ledger`, `/api/plans`, plan preview/save/cancel/completion-preview/confirm. |
| Node Agent | `src/agent/routes.ts`, `src/agent/service.ts` | Session/history/message/proposal routes under `/api/agent`; Agent parses intent and orchestrates read/preview tools. |
| Node Compare/ATM | `src/compare/routes.ts`, `src/compare/alerts-routes.ts` | `/api/compare/quotes`, `/api/atms`, `/api/alerts/check`; comparison uses the configured adapter and ATM/alert reads do not write. |
| Node receipts | `src/receipts/routes.ts` | Private upload, extraction, review, edit, allocation proposal and explicit receipt confirmation under Agent session routes. |
| Node settlements | `src/settlements/routes.ts` | `/api/receivables` reads and `/api/receivables/:id/settlements/confirm` is the explicit repayment writer. |
| Python/FastAPI | `main.py` -> `steve_router.py` | Stateless `/api/compare/quotes`, `/api/alerts/check`, OCR and allocation preview endpoints. Node adapters call these where configured. |

### Frontend request contracts verified

- `frontend/src/api/api.ts` sends live Home/Compare/Agent/Split/repayment requests to Node same-origin `/api` routes; the live facade does not send financial writes to Python.
- Agent messages use `POST /api/agent/sessions/:sessionId/messages`; proposal preview/save use the Node proposal routes. Session history and receipt-event pagination use the corresponding Node reads.
- Compare uses `POST /api/compare/quotes`; ATM & Alerts uses `GET /api/atms?card_network=...` and `POST /api/alerts/check`.
- Split upload/extraction/review/allocation/confirmation uses Node Agent-session receipt routes. Repayment reads and confirmation use Node receivable/settlement routes.
- `frontend/src/ui/Agent.tsx`, `Compare.tsx`, `Home.tsx`, `Split.tsx`, `Repayment.tsx` and `Stretch.tsx` are the current integration surfaces. `Stretch.tsx` renders server-returned ATM metadata and alert values; it does not use frontend ATM fixtures.

### Package, test and verification plan

- Root Node scripts: `npm run build`, `npm run typecheck`, `npm run lint`, database generation/migration/seed, and demo scripts in the root `package.json`.
- Frontend scripts: `npm run dev`, `npm run build`, `npm run lint`; the frontend README documents `npm ci` and also mentions `pnpm install`, but the initial frontend commit tracked `package-lock.json`, not `pnpm-lock.yaml`. `pnpm` is unavailable in the current environment, so npm is the reproducible package-manager path and the two lockfiles should be treated as drift until a team decision says otherwise.
- Python runtime dependencies are pinned in `requirements-compare.txt`; no Python test files or test configuration were found. Available verification is the documented FastAPI/uvicorn runtime and calculator/split scripts.
- Phase 0 did not rerun build, typecheck, lint, dependency audits, browser checks or write-path scenarios; those belong to Phase 1 and later phases after explicit `CONTINUE`.

### Known outstanding issues carried into Phase 1

- The existing checkpoint records frontend `npm run build` failures in the calendar/resizable UI types and root lint failures in unrelated legacy files; these must be reproduced in Phase 1 before any fixes.
- The existing checkpoint records development-only dependency audit findings and a clean production-only audit; those findings must be rerun against the merged branch.
- No automated test suite was found. Browser/runtime verification and financial mutation/replay scenarios remain planned work, not Phase 0 evidence.

## Phase 1 build, typecheck, lint and dependency baseline (20 October 2026)

### Command results

| Check | Result | Evidence |
| --- | --- | --- |
| Root `npm run build` | **PASS** | `tsc -p tsconfig.build.json` completed successfully. |
| Root `npm run typecheck` | **PASS** | `tsc --noEmit` completed successfully. |
| Root ESLint | **PASS** | `node node_modules/eslint/bin/eslint.js .` completed with no errors. |
| Frontend `npm run build` | **PASS** | Frontend TypeScript build and Vite production bundle completed. |
| Frontend `npm run lint` | **PASS** | Oxlint completed with existing warnings only. |
| Python compileall | **PASS** | Main, schema, seed, router, calculator and splitter modules compiled. |
| `steve_calculator.py` self-tests | **PASS** | ATM, exchange budget, target alert and validation cases all passed. |
| Root `npm ci --dry-run --ignore-scripts` | **PASS** | `package-lock.json` is internally installable. |
| Frontend `npm ci --dry-run --ignore-scripts` | **PASS** | Frontend `package-lock.json` is internally installable. |
| Root full audit | **FAIL / 3 high** | `prisma -> @prisma/config -> deepmerge-ts`; fix requires Prisma `7.10.1`, a major upgrade. |
| Root `npm audit --omit=dev` | **FAIL / 3 high** | npm still includes the Prisma chain through `@prisma/client`; deployment-artifact relevance needs separate packaging review. |
| Frontend full audit | **FAIL / 8 dev-only** | Five high and three moderate findings through Tailwind 3.4.1’s build graph. |
| Frontend `npm audit --omit=dev` | **PASS / 0** | No audited frontend production dependencies reported. |
| Automated tests | **NOT AVAILABLE** | No test files or test configuration were found. |

Frontend lint warnings remain non-blocking: Fast Refresh export warnings, one carousel state-in-effect warning, and existing hook dependency/ref-cleanup warnings. No lint rule or audit was suppressed.

### Phase 1 fixes

- Updated the Day Picker wrapper from the removed `table` class key to the installed v10 `month_grid` key in `frontend/src/components/ui/calendar.tsx`.
- Updated the resizable wrapper to the installed v4 `Group` and `Separator` exports in `frontend/src/components/ui/resizable.tsx`.
- Replaced root ESLint `any` errors with typed domain values or guarded `unknown` handling in `frontend/src/api/mock.ts`, `frontend/src/ui/ctx.tsx`, `frontend/src/ui/kit.tsx` and `frontend/src/ui/shared.tsx`.
- Converted `frontend/tailwind.config.js` to ESM and removed the type-only `actionTypes` runtime object from `frontend/src/hooks/use-toast.ts`.
- No package versions, lockfiles, financial rules, fixtures or backend routes were changed.

### Dependency findings and remaining blockers

- Frontend `braces@3.0.3` is reached by `tailwindcss@3.4.1 -> chokidar@3.6.0` and `tailwindcss@3.4.1 -> micromatch@4.0.8`; the advisory is GHSA-vfj7-8cjw-p6xm and npm reports no compatible automatic fix.
- Frontend `postcss-selector-parser@6.1.5` is reached by `tailwindcss@3.4.1` and `postcss-nested@6.2.0`; the advisory is GHSA-rj75-hqrm-r3gf. The patched parser 7.x requires newer parent packages, so no override was applied.
- The frontend findings are build-time tooling findings and absent from npm's production-only tree, but they remain unresolved development vulnerabilities.
- Root `prisma@6.19.3 -> @prisma/config@6.19.3 -> deepmerge-ts@7.1.5` remains high severity. npm offers Prisma `7.10.1` as a major upgrade; it was not applied because the repository pins Prisma 6 and the docs require the client/CLI to stay aligned.
- Python and Node runtime behavior remains green after the source-only fixes. Tracked legacy `__pycache__` files were regenerated by Python verification and are worktree artifacts, not intentional application changes.

Phase 1 is complete. Browser scenarios, Chinese intent/UI integration, ATM/alert runtime checks, financial journey tests, receipt/repayment journeys and security/reliability review remain Phase 2 onward and require another instruction.

## Phase 2 Chinese intent and global language switching (20 October 2026)

### Parser and orchestration verification

Focused `tsx` probes exercised the exact requested input and individual terms:

| Input | Result |
| --- | --- |
| `我有银联卡，想取10万韩元现金，帮我对比附近的ATM` | **PASS**: `atm_withdrawal`, `100000 KRW`, `unionpay`, `krw_cash` destination; source account remains missing and receives a Chinese clarification. Nearby/location is not a supported decision slot and was not invented. |
| `10万韩元` | **PASS**: `100000 KRW`; Chinese clarification fields are returned. |
| `银联` | **PASS**: `card_network: unionpay`; Chinese clarification fields are returned. |
| `取现` | **PASS**: `atm_withdrawal`; amount, source and network are clarified in Chinese. |
| English equivalent with UnionPay, `100000 KRW`, cash and ATM | **PASS**: same internal objective, amount, network and destination semantics. |
| `10万韩元现金 银联` | **PASS**: `100000 KRW`, ATM withdrawal, UnionPay, KRW Cash destination. |
| `我想换汇，需要一万韩元` | **PASS**: `exchange`, `10000 KRW`, Chinese clarification for amount basis/accounts. |

The complete request with explicit `使用马币资金账户` generated the actual DemoAdapter tool call `compare_options` with `{}` arguments after server-side parsing; internal context contained `objective: atm_withdrawal`, `amount_basis: destination_target`, `funding_account: myr_funding`, `card_network: unionpay` and `destination_account: krw_cash`. The deterministic fixture adapter then returned only Shinhan and Woori for UnionPay, with simulated compatibility deliberately remaining `unknown`.

### Defects fixed

- Arabic-plus-Chinese-unit input such as `10万韩元` previously hit the Chinese-word normalizer on standalone `万` and threw `INVALID_AMOUNT_TEXT`; standalone unit tokens now pass through to the existing digit/unit scaling path.
- `KRW Cash`/`韩元现金` in an ATM phrase was previously misclassified as the funding account. ATM parsing now keeps KRW Cash as the destination and asks for MYR Funding or KRW Card when the source is not explicit.
- Explicit exchange intent now takes precedence when exchange and cash wording coexist, so `换汇到韩元现金` resolves to `exchange` with `krw_cash` as destination.

### UI locale verification

- Browser verification ran against Vite on loopback in live mode and showed the Chinese Agent/navigation copy after selecting `中文`; the live Agent session request returned `HTTP_502` because Node was not running.
- A separate Vite mock-mode browser run confirmed the global `English`/`中文` toggle translates navigation and Agent/ATM availability copy. Mock mode intentionally disables financial screens and does not provide numeric ATM/Compare cards.
- Numeric invariance and translated server-backed Agent/Compare/ATM/Split cards were **BLOCKED** in this phase because no Node server/database session was running. No financial state was changed.

### Phase 2 status

Parser and tool-routing checks: **PASS**. Global locale switching: **PASS** for rendered available UI copy. Full live UI card and backend journey verification: **BLOCKED** pending the documented Node/Python runtime setup. No automated test suite exists; verification used focused parser/orchestration probes and browser checks. Phase 3 remains pending the next instruction.

## Resume commands and configuration (PowerShell)

Start from the repository root. Preserve private `.env`, financial databases and uploads. **Do not run reset, reseed or SQLite-to-Supabase copy against the existing installation.** No migration is introduced by this checkpoint.

```powershell
git status --short --branch
git switch codex/frontend-compare  # only after reviewing any new local work
# If dependencies are already installed, no reinstall is required to resume.
# Fresh checkout only: npm ci
# Existing .env is loaded by Node's current dotenv mechanism.
```

Run three terminals from the repository root:

1. Steve's service (the documented private Python environment must already exist; see root README for first-time setup):

```powershell
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONPYCACHEPREFIX = Join-Path (Get-Location) '.local/python-cache'
.\.local\compare-python\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --no-access-log
```

2. Node:

```powershell
$env:COMPARE_PROVIDER = 'steve'
$env:STEVE_COMPARE_BASE_URL = 'http://127.0.0.1:8000'
$env:RECEIPT_PROVIDER = 'steve'
# Fictional stable identities for local demo only; use the agreed server-side directory.
$env:RECEIPT_PARTICIPANTS_JSON = '[{"participant_id":"demo-profile","display_name":"Payer"},{"participant_id":"demo-daniel","display_name":"Daniel"},{"participant_id":"demo-tze-loon","display_name":"Tze Loon"}]'
$env:HOST = '127.0.0.1'
$env:PORT = '3000'
# For real Agent: the key stays in ignored .env; never print it or put it in browser variables.
$env:AGENT_PROVIDER = 'groq'  # replaces any inherited demo override
$env:GROQ_MODEL = 'openai/gpt-oss-120b'
Remove-Item Env:AGENT_DEMO_FAILURE -ErrorAction SilentlyContinue
npm run dev
```

Keep the existing private database provider/URL and Groq key settings in `.env`; inherited PowerShell environment settings override `.env`. Do not print those settings or place them in this document. Compare/Home need no Groq credential. The commands explicitly choose real Groq; if configuration should come entirely from `.env`, use `Remove-Item Env:AGENT_PROVIDER,Env:GROQ_MODEL,Env:AGENT_DEMO_FAILURE -ErrorAction SilentlyContinue` before launching instead. If an inherited key is stale, clear `Env:GROQ_API_KEY` without printing it so dotenv can load the private file. See `docs/agent.md`. Explicit `AGENT_PROVIDER=demo` is scripted verification only, never real-model evidence. Never paste credentials into chat or browser configuration.

3. Frontend:

```powershell
$env:VITE_USE_MOCK = 'false'
$env:VITE_API_BASE_URL = ''
$env:BORDERWISE_DEV_API_TARGET = 'http://127.0.0.1:3000'
Set-Location frontend
# Fresh checkout only: npm ci
npm run dev -- --host 127.0.0.1
```

Open the Vite URL printed in the terminal (default port 5173), then Home or Compare. Same-origin `/api` proxies to Node. If port 3000 is occupied, choose another Node `PORT` and use that same port in server-only `BORDERWISE_DEV_API_TARGET`; do not stop another process blindly. Public `VITE_API_BASE_URL`, if deliberately used, accepts HTTPS or loopback HTTP without credentials/query/fragment. No database URL, Groq key or secret belongs in any `VITE_*` variable.

Checks from root:

```powershell
npm run build
npm run typecheck
node node_modules/eslint/bin/eslint.js src scripts eslint.config.js frontend/src/App.tsx frontend/src/api/api.ts frontend/src/api/types.ts frontend/src/ui/Compare.tsx frontend/src/ui/Home.tsx frontend/src/ui/PlanCompletion.tsx frontend/vite.config.ts
node node_modules/eslint/bin/eslint.js frontend/src/ui/Agent.tsx frontend/src/ui/AgentCards.tsx frontend/src/ui/AgentProposal.tsx frontend/src/ui/AgentRisks.tsx frontend/src/ui/agent-state.ts
node node_modules/eslint/bin/eslint.js frontend/src/api/split-types.ts frontend/src/ui/Split.tsx frontend/src/ui/ReceiptReview.tsx frontend/src/ui/Repayment.tsx frontend/src/ui/split-state.ts
npm run lint  # expected current failure: 13 unrelated errors (20 at checkpoint)
Set-Location frontend
npm run lint
npm run build  # expected current failure: six calendar/resizable type errors
node node_modules/vite/bin/vite.js build  # bundling only; not a full build pass
```

For future write-path verification create a disposable database/private upload directory and override configuration only in those child processes. One-off verification servers/databases are cleaned up after checking; local ignored evidence is not required to run the app. Keep financial confirmation behind existing explicit frontend-action routes. This checkpoint is prepared for draft PR review. Do not merge or begin deferred tasks.

## Phase 3 ATM and alerts verification (20 October 2026)

### Live backend verification

The documented local services ran without reseeding or resetting the existing database: Python Steve on `127.0.0.1:8000`, Node on `127.0.0.1:3000` with `COMPARE_PROVIDER=steve`, and Vite live mode on `127.0.0.1:5176`.

- `GET /api/atms?card_network=unknown` returned all four canonical providers in cost order: KB Kookmin, Shinhan, Woori and CU.
- Visa returned all four; Mastercard returned KB Kookmin, Shinhan and CU; UnionPay returned Shinhan and Woori; Plus returned KB Kookmin and Woori.
- Each response contained server-provided rates, converted MYR fee lines, supported networks, distances, Simulated provenance, Naver HTTPS links and Kakao HTTPS links.
- The live frontend rendered the same Node response without frontend ATM fixtures. It displayed both map buttons for every provider, operator fees, distances, network badges and compatibility provenance.
- UnionPay browser filtering visibly excluded KB Kookmin and CU and displayed only Shinhan/Woori.
- English and Chinese browser views retained identical financial values: for UnionPay, RM 344.27 / ₩100,000 for Shinhan and Woori; only labels, statuses and descriptive UI copy changed.
- Map links were verified in the DOM against the intended `map.naver.com` and `map.kakao.com` URLs.

### Target-rate alert verification

`POST /api/alerts/check` with `{ "pair": "MYR/KRW", "target_rate": 315, "direction": "above" }` returned current rate `315.5`, target `315`, `triggered: true`, the seeded seven-day history `[309.5, 310.2, 311, 312.8, 313.5, 314.2, 315.5]`, planned amount `RM 500.00`, estimated proceeds `₩157,750`, and a `Simulated` badge from `Seeded 7-Day FX Dataset`. The recommendation explicitly stated that no exchange was executed.

The live browser displayed the alert result and chart. Two missing Chinese labels were found and fixed in `frontend/src/ui/i18n-ui.ts`: `Alert me when RM 1 buys at least` and `Target reached`. The rerender showed `当 RM 1 至少可兑换` and `已达到目标`; all numeric values remained unchanged.

### Phase 3 status

ATM provider coverage, fee/rate consistency, compatibility filtering, provenance, map links, alert threshold behavior and English/Chinese numeric equivalence: **PASS**. No financial writes or plan/session mutations were performed. The live services were temporary verification processes and were stopped after the browser checks. Phase 4 remains pending the next instruction.

## Phase 4 Agent-to-Compare-to-Reserve-to-Home journey (20 October 2026)

### Baseline

The existing local database was used without reseeding or resetting. Baseline Home state was MYR Funding `RM3970.33`, KRW Card `₩238000`, KRW Cash `₩95000`, fixed plus emergency reserve `RM2000.00`, available above reserve `RM1970.33`, budget status `Above reserve`, and no pending plans.

### Scenario results

- The exact requested text containing `₩100,000` was rejected with `INVALID_AMOUNT_TEXT` because the current parser deliberately rejects grouped amounts rather than silently normalizing them. This is a documented validation limitation, not an invented amount.
- The equivalent ungrouped supported request with Visa and `MYR Funding` parsed to `100000 KRW`, `atm_withdrawal`, Visa, `myr_funding` and `krw_cash`, then returned four Steve-ranked simulated options.
- The first option was KB Kookmin at `RM343.74` total debit and `₩100000` received. The Agent response remained read/preview-only and did not save a plan.
- The required frontend proposal-preview route returned `RM343.74` total debit, projected MYR balance `RM3626.59`, reserve `RM2000.00`, shortfall `RM0`, and `requires_reserve_acknowledgement: false`.
- Explicit proposal Save created one pending plan. Home balances remained exactly unchanged, and the pending plan appeared separately with provider KB Kookmin and total debit `RM343.74`.
- A deliberate `₩1000000` Visa/MYR target produced a reserve-breach preview: projected balance `RM741.98`, reserve shortfall `RM1258.02`, and `requires_reserve_acknowledgement: true`. Safe-principal guidance correctly required a revised quote rather than inventing a value.
- The saved safe pending plan was cancelled through `POST /api/plans/:planId/cancel`; Home balances remained unchanged and no pending plans remained.

### Integration limitations discovered

- The exact comma-formatted scenario needs either user clarification or a separately reviewed parser change before it can satisfy the stated `₩100,000` acceptance input.
- Explicit `KRW Card` funding reached Node correctly but Steve rejected the current KRW-funded ATM representation because its authoritative principal/fee/total fields are MYR-based. The supported integrated journey currently requires `MYR Funding` for Steve ATM quotes.
- Seoul/nearby location is preserved as user intent only; no location-based pricing or device location was invented.

### Phase 4 status

Supported MYR-funded Agent -> Compare -> reserve preview -> explicit Save -> Home -> cancel journey: **PASS**. Exact grouped-amount scenario and KRW-funded ATM variant: **BLOCKED/UNSUPPORTED**, documented above. No completion confirmation or financial posting was performed in this phase. Phase 5 remains pending the next instruction.

# Frontend integration checkpoint

Status on 20 October 2026: **Compare/Home checkpoint `4195fea`, connected Agent frontend and hardened pending-risk pagination are complete for team review on `codex/frontend-compare`.** Draft PR #5 targets `backend/money-ledger-agent`; no merge is performed. Home/Compare and the explicit read-only risk refresh fallback are preserved. Next work requires a separate instruction: review this checkpoint, then choose maintenance, receipt/Split frontend adoption or translation explicitly. Do not begin those tasks here.

## Completed

- Manual Compare calls Node's validated shared Steve comparison boundary, preserving objective, amount mode, currency, funding account and card network. It displays backend ranking/amounts/fees/compatibility/provenance and uses trusted proposals, current reserve preview, explicit acknowledgement and Save. Saving creates a pending plan with no balance/ledger effect.
- Home reads Node profile, separate MYR/KRW balances, stated reserves, ledger, pending plans and independent risk assessments. Actual MYR budget status stays distinct from forecast pending-plan risk. Backend source badges remain visible.
- Actual completion collects principal, individually paid fees, amount received, supported owned accounts and completion timestamp. Existing Node preview returns quote differences/account impacts/reserve warnings. Only explicit confirmation with applicable acknowledgement posts actuals. Stable keys and identical-body retries preserve backend idempotency.
- Not Completed Yet leaves pending state and financial records unchanged. Cancellation changes plan status only. Successful posting stays successful if optional refresh reads fail; Home labels cached data and provides read-only recovery.
- Agent now creates/resumes Node sessions, loads persisted history and sends every message/starter to Node. It renders backend clarifications, balances, ranked Simulated comparisons, reserve previews, trusted proposals, plans/ledger and pending-plan assessments. Explicit preview/Save uses trusted proposal IDs; supported completion actions reuse Home's existing form. Session/action retry state is independent of history reloads, and shared Home/plans reads refresh after successful actions.
- Existing branding/layout, Home/Compare source, shared server contracts, database migrations and dependencies are preserved. Node remains the sole financial writer. Receipt editing/uploads, Split/settlement UI and translation work remain deferred. Chat cannot save, confirm, cancel or post financial activity.

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
| Root `npm run lint` | **Fails** with 14 unrelated errors, down from the checkpoint's 20 because the replaced Agent code had six errors; no checks/rules were disabled. |

The six frontend errors are `src/components/ui/calendar.tsx:85` (unsupported `table` class key) and `src/components/ui/resizable.tsx:9,10,25,28,40` (removed PanelGroup/PanelResizeHandle exports). The checkpoint had 20 root lint errors; six in Agent were removed by this step, leaving 14 in `frontend/src/api/mock.ts`, `hooks/use-toast.ts`, `ui/Split.tsx`, `ui/ctx.tsx`, `ui/kit.tsx`, `ui/shared.tsx` and `frontend/tailwind.config.js`. They are not new integration regressions. Resolve these in a separate scoped maintenance change; do not hide them by disabling checks.

Other limitations:

- Compare pricing and network evidence are seeded **Simulated**. Unknown compatibility remains unknown; no live rates/ATM availability is claimed. The engine rejects KRW-funded pricing/source-principal requests and card purchases.
- Home completion supports the existing exchange/ATM restrictions only. Actual money/fees are user-reported, not bank-verified. The frontend does not calculate FX, fees or reserves.
- Ambiguous completion bodies survive modal/tab navigation in memory, but not a full page reload. After a reload read Node's recorded status before re-entering actuals; server idempotency/terminal-plan guards remain authoritative.
- Authentication is absent; all local APIs use the seeded demo profile. Keep servers on loopback. Deployment/CORS, multi-user isolation, live bank execution, receipt/Split frontend adoption, Chinese translation and real OCR remain outside this step. OCR still returns **Simulated sample output**. Tab-scoped Agent session/action state is not production user authentication; losing browser state does not remove backend idempotency or financial ownership checks.
- The last backend dependency audit retains three high package findings through Prisma configuration's deepmerge-ts dependency. Frontend dependency remediation is not included; unchanged dependencies are not a vulnerability-free claim. See the dated audit scope in the linked report.
- Private `.env`/credentials, databases/sidecars, uploads, temporary checks, node_modules and build output are excluded from this checkpoint. The base repository already tracks 2765 files under a legacy Linux `.venv`; those existing team files are unchanged here. The ignore rule prevents new runtime files but cannot untrack historical ones. Removing that legacy runtime belongs in a separate repository-hygiene change.

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
npm run lint  # expected current failure: 14 unrelated errors (20 at checkpoint)
Set-Location frontend
npm run lint
npm run build  # expected current failure: six calendar/resizable type errors
node node_modules/vite/bin/vite.js build  # bundling only; not a full build pass
```

For future write-path verification create a disposable database/private upload directory and override configuration only in those child processes. One-off verification servers/databases are cleaned up after checking; local ignored evidence is not required to run the app. Keep financial confirmation behind existing explicit frontend-action routes. This checkpoint is committed/pushed for draft PR review only; do not merge or begin deferred tasks.

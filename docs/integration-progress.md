# Frontend integration checkpoint

Status on 20 October 2026: **Compare and Home completed; feature work paused for team review.** Working branch: `codex/frontend-compare`. The fetched default branch is `backend/money-ledger-agent`; the checkpoint starts from merged PR #4 (`d8cc911`). This checkpoint is intended for a draft PR, not an automatic merge. **Next task: Agent frontend integration**, only after an explicit follow-up; it has not started here.

## Completed

- Manual Compare calls Node's validated shared Steve comparison boundary, preserving objective, amount mode, currency, funding account and card network. It displays backend ranking/amounts/fees/compatibility/provenance and uses trusted proposals, current reserve preview, explicit acknowledgement and Save. Saving creates a pending plan with no balance/ledger effect.
- Home reads Node profile, separate MYR/KRW balances, stated reserves, ledger, pending plans and independent risk assessments. Actual MYR budget status stays distinct from forecast pending-plan risk. Backend source badges remain visible.
- Actual completion collects principal, individually paid fees, amount received, supported owned accounts and completion timestamp. Existing Node preview returns quote differences/account impacts/reserve warnings. Only explicit confirmation with applicable acknowledgement posts actuals. Stable keys and identical-body retries preserve backend idempotency.
- Not Completed Yet leaves pending state and financial records unchanged. Cancellation changes plan status only. Successful posting stays successful if optional refresh reads fail; Home labels cached data and provides read-only recovery.
- Existing branding/layout, shared server contracts, database migrations and dependencies are preserved. Node remains the sole financial writer. Agent chat, Split/receipt screens and translations were not integrated or redesigned in this checkpoint.

## Evidence and handover

- [Manual Compare: routes, configuration, UI verification and retry handling](manual-compare.md)
- [Home: existing routes, actuals, current budget versus forecast, UI verification](home-integration.md)
- [Steve comparison adapter and backend ownership](compare-integration.md)
- [Plan preview/Save/completion/cancellation contracts](priority-3.md)
- [Pending-plan risk and refresh semantics](pending-plan-risk.md)
- [Agent contracts and configuration for the next task](agent.md), [limited earlier real-Groq observations](groq-verification.md)
- [Receipt review](receipt-review.md), [authoritative settlements](settlements.md), [shared-expense confirmation](shared-expenses.md)
- [Dependency findings and deferred maintenance](dependency-audit.md)
- [Existing Supabase installation and preservation/rollback guidance](supabase.md)

Observed browser verification used actual Python/Node/Vite processes and disposable migrated/seeded SQLite/private storage, with no configured Supabase access. Visa/UnionPay comparison, revised quotes, explicit reserve acknowledgement, Save and Home display were exercised. Save, completion preview, Not Completed Yet and cancellation left financial snapshots unchanged. Actual completion posted MYR 2500 principal plus separate MYR 10/MYR 20 fees and KRW 800000 received once; a deliberately dropped response and repeated retry clicks returned the same posting. Forced refresh failures did not misreport the successful posting. Restored reads showed MYR 1491.33, KRW Cash 880000 and unchanged KRW Card 218000. Full per-scenario observations are in the linked guides. These are local integration observations, not live bank execution or additional real-model verification.

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
| Root `npm run lint` | **Fails** with 20 unrelated errors; no checks/rules were disabled. |

The six frontend errors are `src/components/ui/calendar.tsx:85` (unsupported `table` class key) and `src/components/ui/resizable.tsx:9,10,25,28,40` (removed PanelGroup/PanelResizeHandle exports). The 20 root lint errors remain in `frontend/src/api/mock.ts`, `hooks/use-toast.ts`, `ui/Agent.tsx`, `ui/Split.tsx`, `ui/ctx.tsx`, `ui/kit.tsx`, `ui/shared.tsx` and `frontend/tailwind.config.js`. They are not errors in the new Compare/Home implementation. Resolve these in a separate scoped maintenance change; do not hide them by disabling checks.

Other limitations:

- Compare pricing and network evidence are seeded **Simulated**. Unknown compatibility remains unknown; no live rates/ATM availability is claimed. The engine rejects KRW-funded pricing/source-principal requests and card purchases.
- Home completion supports the existing exchange/ATM restrictions only. Actual money/fees are user-reported, not bank-verified. The frontend does not calculate FX, fees or reserves.
- Ambiguous completion bodies survive modal/tab navigation in memory, but not a full page reload. After a reload read Node's recorded status before re-entering actuals; server idempotency/terminal-plan guards remain authoritative.
- Authentication is absent; all local APIs use the seeded demo profile. Keep servers on loopback. Deployment/CORS, multi-user isolation, live bank execution, receipt/Split frontend adoption and real OCR remain outside this checkpoint. OCR still returns **Simulated sample output**.
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
npm run dev
```

Keep the existing private database provider/URL settings in `.env`; inherited PowerShell environment settings override `.env`. Do not print those settings or place them in this document. Compare/Home need no Groq credential. Agent configuration and a real-model check are separate follow-up work; consult `docs/agent.md` before selecting its provider, including clearing a stale session-level `AGENT_PROVIDER=demo` when real Groq is actually intended. Never paste credentials into chat or browser configuration.

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
npm run lint  # expected current failure: 20 unrelated errors
Set-Location frontend
npm run lint
npm run build  # expected current failure: six calendar/resizable type errors
node node_modules/vite/bin/vite.js build  # bundling only; not a full build pass
```

For future write-path verification create a new disposable database/private upload directory and override configuration only in those child processes. The previous one-off verification servers/database were cleaned up; local ignored evidence is not required to run the app. Keep financial confirmation behind existing explicit frontend-action routes. Do not start Agent integration or merge the draft as part of saving this checkpoint.

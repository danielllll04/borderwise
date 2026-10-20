# Manual Compare integration

Follow-up: [Home integration](home-integration.md) now reads Compare-saved plans and handles explicit actual completion/cancellation using the existing Node APIs. The verification below records the original Compare step; the Home guide records subsequent checks and the current root lint count.

This step starts from merged PR #4 (`d8cc911`) on `codex/frontend-compare`. No receipt/settlement screens, translations or dependencies are changed. Node remains the sole financial writer. Compare and Save persist workflow metadata only; neither posts money nor reserves funds.

## Run

Run Steve and Node using the root README, with `COMPARE_PROVIDER=steve`, trusted server-only `STEVE_COMPARE_BASE_URL=http://127.0.0.1:8000` and the existing bounded timeout. Manual Compare requires no model/Groq credential. Existing financial installations must not be reset, seeded or recopied for this integration.

In a separate PowerShell terminal, from `frontend`:

```powershell
npm ci
$env:VITE_USE_MOCK = 'false'
# Optional if Node runs on a different port; this is a Vite server setting only.
# $env:BORDERWISE_DEV_API_TARGET = 'http://127.0.0.1:17900'
npm run dev -- --host 127.0.0.1
```

Open the Compare tab. Live mode now defaults on; explicitly selected mock mode reports manual backend Compare unavailable. There is no HTTP-to-fixture fallback. Leave `VITE_API_BASE_URL` empty for same-origin `/api`; the dev proxy targets Node port 3000 unless overridden. Public remote API roots must use HTTPS (loopback HTTP also permitted) without credentials/query/fragment. Deployments should use a same-origin reverse proxy or deliberately configure CORS. No key/database URL belongs in browser variables. Authentication is still absent; keep local servers on loopback.

## Narrow Node boundary

`POST /api/compare/quotes` accepts only validated decision fields, not an arbitrary URL or client-calculated quote:

```json
{
  "objective": "atm_withdrawal",
  "amount": { "amount_minor": 100000, "currency": "KRW" },
  "amount_basis": "destination_target",
  "funding_account": "myr_funding",
  "destination_account": "krw_cash",
  "card_network": "unionpay"
}
```

Objectives are exchange, ATM withdrawal, or explicitly unsupported card. MYR fixed budgets map to `total_debit_budget` including all fees; whole-won KRW targets map to `destination_target`. Funding and network choices are preserved. Missing ATM network is rejected; explicit unknown stays unknown. Current Steve routing supports MYR Funding to KRW Card/Cash; KRW funding and source principal are unsupported rather than reinterpreted. Money parsing rejects excess decimal precision/unsafe integers instead of silently rounding.

Both Agent and manual routes call `readComparison` with the configured existing adapter and shared response validation. Steve calculates/ranks; Node calls existing PlanService preview for authoritative balance/reserve values. Ready responses contain `session_id`, source/ranking and options with original selection, rank, compatibility/ATM metadata, `snapshot_id`, nullable `proposal_id`, preview and any blocking error. Unsupported/no-match responses contain a reason and no options; HTTP failures use existing safe error envelopes. No prices/fees are calculated or sorted in the manual screen.

The route stores owned immutable snapshots/proposals in the existing workflow tables under a metadata-only session. This invokes no LLM and changes no shared models or schema/migrations. Snapshot assumptions retain the decision, upstream metadata and `origin=manual_compare`. A failed financial preview blocks selection without making an unsupported option saveable.

## Trusted selection, acknowledgement and retries

Selection opens the existing `POST /api/agent/sessions/:sessionId/proposals/:proposalId/preview`. The manual API method unwraps its actual `{ selection, preview, ... }` response; it never reconstructs a selection from rendered cards. The modal displays Node's current balance, reserves, total debit, projected balance and shortfall. No Save occurs on modal mount, including React StrictMode's repeated effects.

Save calls the existing proposal `/save` with `frontend_action=save_pending_plan`, the reviewed token and a deterministic `manual-compare:<proposal UUID>` retry key. A reserve warning requires a checked explicit acknowledgement for that same token. ProposalService delegates to existing PlanService, including in-transaction stale validation, reserve acknowledgement, replay/conflict and database contention handling. No unrestricted posting route is added.

The UI guards in-flight repeated clicks and retains the exact first submitted token/acknowledgement for ambiguous network retries, even if the modal is closed/reopened on the same result. A known stale/acknowledgement rejection requires a fresh preview and acknowledgement; it never invents a new payment or automatically bypasses a warning. The same proposal/key cannot create a second plan. Explicitly fetching new quotes creates new proposals and represents a separate possible Save intent.

The revised-budget action uses only Node's `reserve_check.max_safe_total_debit`, switches to a MYR total-budget request and fetches entirely new quotes. It never scales an old principal/net/fee or assumes a fixed fee. On success the existing `bump()` convention invalidates Home/pending reads, immediate follow-up reads run independently, and Home reloads the pending plan. Read failure cannot turn committed Save into financial failure. The screen includes loading, initial/empty, unsupported, error, retry and upstream-unavailable states; changed inputs invalidate older in-flight display results.

## Observed verification

Browser verification ran against separate actual Python/Node/Vite processes on loopback alternate ports, a disposable migrated/seeded SQLite database and private temporary uploads. A local observation/fault proxy captured fictional service requests/responses. Existing `.env`, financial databases and uploads were preserved; configured Supabase was not opened.

| Scenario | Observed |
| --- | --- |
| Visa target | Actual browser request reached Steve with Visa and KRW 100000 target; UI preserved four-option order and total debits 34374/34427/34427/35157 sen, exact fees/net and Simulated provenance. |
| UnionPay target | Actual browser request reached Steve; UI showed Shinhan then Woori, both 34427 sen, with compatibility explicitly scoped to seeded evidence. |
| Reserve preview | MYR 2500 budget showed Node balance RM4021.33, reserve RM2000, projected RM1521.33 and shortfall RM478.67. Override Save stayed disabled before acknowledgement. |
| Revised quotes | UI requested the authoritative RM2021.33 safe total budget from Steve, received new quote IDs/net/fee values and displayed a fresh preview at RM2000 reserve. It did not auto-save. |
| Save/retry | Explicitly acknowledged Save was double-clicked; first successful reply was deliberately dropped after commit. UI showed recoverable HTTP502 and Retry Save. Retry used an identical body/key; exactly one pending plan existed and Home showed it with reserve override. Additional concurrent API replays also returned that same plan. |
| Financial preservation | Before/after hashes of every isolated account, activity, ledger entry, receivable and settlement matched, including after Save and replays. No completion was confirmed. |
| Upstream failure | Simulated HTTP503 outage displayed `COMPARE_UNAVAILABLE`, cleared previous cards and offered Retry Compare; restoring actual service recovered results without fixtures. |
| API boundaries / Agent | Invalid/extra fields, fractional money and missing network rejected; unsupported card/funding explicit; foreign-session proposal and unreviewed/forged Save rejected. Changed saved payload conflicted. Scripted Agent still returned shared-service comparison/proposal without saving or inference. |

## Checks and remaining limits

Node build/type-check/backend lint and changed-file ESLint pass. Frontend `npm run lint` (oxlint) passes with existing warnings outside changed files. Vite asset production bundling passes. Full frontend `npm run build` / TypeScript check remains blocked by **six unrelated existing errors** in `src/components/ui/calendar.tsx` (obsolete `table` class key) and `resizable.tsx` (removed PanelGroup/PanelResizeHandle exports). Those components were not changed. The baseline first stopped at deprecated `baseUrl`; removing that obsolete option preserves the existing relative path aliases and exposes these underlying errors. ApiError parameter properties were replaced by equivalent explicit fields to satisfy the existing erasable-syntax setting; no compiler/lint check was disabled.

Full root ESLint still reports **23 existing errors** in untouched frontend source (down from 26 after removing three explicit-any uses in files touched here). Generated `dist`/`node_modules` exclusions now cover both backend and frontend directories; no source checks/rules are disabled. No dependency/lockfile upgrade or test suite was added.

Compare still uses seeded Simulated prices/network evidence; no live ATM availability/location, market rates or provider execution is claimed. Current adapter rejects KRW funding, source principal and card purchases. Existing quote freshness/in-memory Python store limitations apply. Manual Compare alone is connected here; receipt/settlement screens, Agent's scripted starter flows, production authentication and deployment remain separate work. No real-Groq call was needed for this UI step.

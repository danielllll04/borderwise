# Home integration

Implemented on `codex/frontend-compare`, preserving the existing manual Compare integration. The Home implementation step changed Home, a completion modal, frontend API types/facade and documentation only. No Node route, shared server model, migration, dependency, Agent chat, Split screen or translation changes were needed for Home. Node remains the sole financial writer. See the subsequent [review checkpoint and resume guide](integration-progress.md) for the combined Compare/Home handover; the implementation step itself did not commit or push.

## Run and ownership

Use the existing [two-backend setup](../README.md) and [frontend setup](../frontend/README.md), with `COMPARE_PROVIDER=steve` and frontend live mode. Home itself needs no Groq call. All browser requests use the existing safe API configuration; credentials remain server-only. Explicit mock mode reports authoritative Home unavailable. Keep servers on loopback: authentication is still absent. Existing installations must not be reset or reseeded for verification.

The central `api.homeBackend` facade uses only existing routes:

| Request | Purpose |
| --- | --- |
| `GET /api/home` | Profile, separate-currency balances and actual recorded MYR budget/reserves. |
| `GET /api/ledger?limit=20&cursor=…` | Confirmed ledger with provenance and separate fee entries. |
| `GET /api/plans?status=pending&limit=20&cursor=…` | Trusted saved pending plans, including manual Compare Saves. |
| `GET /api/plans/assessments?limit=20&cursor=…` | Independent current forecasts; no reservation or posting. |
| `GET /api/plans/:id` | Read recorded status after an uncertain confirmation response. |
| `POST /api/plans/:id/completion-preview` | Validate actuals and return account impacts, quote differences and reserve checks without posting. |
| `POST /api/plans/:id/confirm` | Explicit confirmation through the existing atomic/idempotent posting service. |
| `POST /api/plans/:id/cancel` | Pending-plan status only; no ledger or balance effect. |

Home retains the coral branding, balances, reserve categories, pending cards and ledger layout. MYR Funding, KRW Card and KRW Cash remain separate. Current budget status/available amount/shortfall come from Node's MYR budget, never a converted combined balance. The reserve colour strip is explicitly decorative, not a calculated allocation chart. Each financial value/quote shows its source badge. A seeded balance remains Simulated even after user-reported activity; actual ledger entries are User-Confirmed.

The forecast section shows each pending plan's backend state, explanation, timestamp and relevant reserve shortfalls/account deficits. Plans are evaluated independently; their forecasts are not added to current budget status. Saved reserve acknowledgements are historical. Paginated reads have independent loading/error/empty states and load-more actions. Failed refreshes identify cached snapshots; unavailable data is never assumed to be zero.

## Actual completion and cancellation

The completion modal collects actual principal, actual amount received, each separately labelled fee and its owned account, supported source/destination accounts, and actual ISO completion time with timezone. Quote values are prefilled for review, not certified as actual. Amount parsing only represents MYR to two decimal places and integer KRW in minor units, without rounding; it performs no fee, reserve or FX calculations. Changing account currency clears the affected amount rather than converting it. Exchange and ATM restrictions remain enforced by Node; card purchases are unsupported. ATM source may be MYR Funding or KRW Card, with KRW Cash as destination. Same-currency principal and received amounts must match, with fees separate.

Preview submits `actual` to the existing endpoint and displays its full Node account impacts, differences from saved quoted principal/total debit/received/fees/accounts and current reserve warning. Different currencies show no fabricated converted difference. Separately paid MYR fees on a KRW-funded transaction use Node's other-account reserve check. Editing any input invalidates the preview and acknowledgements. Submission requires an explicit completed-elsewhere checkbox and the current reserve acknowledgement when required. A warning acknowledgement never overrides insufficient funds.

“Not Completed Yet” before submission closes the modal and refreshes reads; the plan stays pending with no financial change. Cancel Plan calls only the existing cancellation endpoint. No plan-edit feature is added.

Confirmation uses `home-completion:<plan UUID>` plus the exact reviewed actuals, timestamp and reserve token. In-flight guards prevent repeated UI submissions. Ambiguous network failure freezes the submitted body and offers Retry original confirmation / Check recorded status. The attempt remains in memory across modal/tab navigation, with no financial data written to browser storage. A full page reload loses this in-memory body: read Node's plan status before re-entering anything; backend idempotency/conflict and completed-plan guards still prevent a second posting. Definitive validation/stale-acknowledgement rejection requires a new preview. Backend atomic protections remain authoritative.

Posting success closes the modal, hides the known resolved plan immediately and triggers the existing `bump()` read refresh convention for balances, ledger, pending plans and assessments. Read failures display separately with cached-data labels and a read-only retry button. They cannot report an already committed confirmation as a failed posting or offer it again on the cached card. Cancellation follows the same independent refresh convention.

## Observed running-UI verification (2026-10-20)

Actual Python, Node and Vite processes ran on alternate loopback ports with fresh migrated/seeded temporary SQLite and a private temporary upload directory. The configured Supabase database was not opened. Fault injection operated only on the disposable Node instance. Browser actions used the real UI and existing HTTP routes; no LLM, bank or real provider execution was involved.

| Scenario | Observed result |
| --- | --- |
| Initial reads | MYR 4021.33, KRW Card 218000, KRW Cash 80000; actual Above reserve with MYR 2000 reserve. Separate currencies, provenance and seeded ledger displayed. |
| Compare Save | UnionPay ATM MYR 2500 budget reached Steve; explicit acknowledged Save produced one pending Home card. All financial-row fingerprints stayed identical. Existing Compare was also exercised with exchange and Visa requests. |
| Actual versus forecast | Actual Above reserve remained separate from pending Would breach reserve, with Node forecast shortfall MYR 478.67. |
| Preview / Not Completed Yet | Entered MYR 2500 principal, MYR 10 + MYR 20 separately paid fees, KRW 800000 received, actual timestamp `2026-10-20T02:00:00Z`. Node projected MYR 1491.33 and shortfall 508.67; principal difference 23.55, total-debit difference 30 and received difference KRW 27843. Preview and Not Completed Yet changed no financial rows and left the plan pending. |
| Explicit acknowledgement | Confirmation remained disabled until both actual-completion confirmation and the current reserve acknowledgement were checked. |
| Dropped response / repeat clicks | First confirm committed and its response was deliberately dropped. UI showed recoverable HTTP502 and frozen retry details. Double-clicking Retry sent one identical retry body/key. Exactly one completion activity and three new ledger entries existed: principal plus two separate fees. |
| Optional refresh outage | All optional Home/ledger/plans/assessment GETs deliberately returned 503 after posting. UI retained recorded-success notice, labelled cached data and hid the completed plan's action. No second posting was offered as recovery. |
| Read recovery | Restoring reads refreshed MYR 1491.33, KRW Cash 880000 and unchanged KRW Card 218000; current Below reserve / MYR 508.67 shortfall, separate User-Confirmed ledger fees and no pending forecast. |
| Cancellation | Another Compare-saved exchange plan was cancelled by double-click. Status became cancelled; financial fingerprint stayed identical to the post-completion checkpoint. |
| Supported accounts / rejection | KRW Card-funded ATM preview with separate MYR/KRW fees rejected mismatched same-currency principal/received. Correcting received to match principal produced Node account impacts and a MYR fee-account reserve warning, without a converted quote difference. Not Completed Yet and subsequent cancellation caused no posting. |

Final isolated state contained one completed plan, two cancelled plans, no pending plans, exactly one completion activity and nine total ledger entries (six baseline plus principal/two fees). Financial fingerprints include accounts, activities, ledger entries/lines, receivables and settlements. No receipt or settlement UI was wired. Verification logs/screenshots are ignored local artifacts, not application fixtures or a new test suite.

## Checks and remaining blockers

- Node build, Node type-check and backend/changed-file ESLint pass.
- Frontend oxlint passes with existing warnings outside Home/API changes; Vite production asset bundling passes.
- Full frontend production build (`tsc -b && vite build`) still fails on six existing errors: `calendar.tsx:85` uses an unsupported `table` class key; `resizable.tsx:9,10,25,28,40` references removed PanelGroup/PanelResizeHandle exports. No Home/API errors were reported. These untouched components remain a full-build blocker.
- Full-root ESLint still fails with 20 unrelated errors in mock, use-toast, Agent, Split, ctx, kit, shared and Tailwind configuration (previously 23; the three removed errors were in the replaced Home code). No check was disabled and no dependency was upgraded.
- Comparison prices/network evidence remain seeded **Simulated**. OCR remains Simulated sample output. No bank execution, production authentication, Agent/Split/receipt frontend adoption, live market data or deployment verification is claimed.

Existing `.env`, financial files and uploads were preserved, and prior Compare implementation files were retained. The temporary verification database and servers are removed/stopped after checking; application private records are not copied into verification artifacts.

# Agent pending-risk pagination

This checkpoint fixes the failure in [Agent frontend verification](agent-frontend.md): Groq copied an owned plan ID into the old UUID `cursor` parameter, so the correct assessment service skipped that plan. Listing a plan does not issue a risk continuation.

## Model boundary

`read_pending_plan_risks` accepts `{limit?: 1..5, continuation?: string}`. Omit continuation for the first page (default size three). Raw database cursors and plan IDs are not model parameters. Only this tool's `next_continuation`, an opaque `risk-page:<random UUID>` reference, may continue its session flow. Legacy `cursor` or malformed pagination is recovered through a real first-page read.

References bind to the owned session, latest risk flow, actual service-returned next cursor, page size, financial-context fingerprint and a 15-minute flow expiry. A new first page invalidates old flows; advancing invalidates the previous reference. Omitting limit during continuation reuses the bound size; explicitly changing it restarts pagination. Cross-session, invented, expired, superseded or missing-boundary references cannot skip plans. Changed financial context also restarts at the first page.

Recovery returns `pagination.status=restarted`, a reason and the **actual** first-page service response. No risk cards or financial values are manufactured. Service unavailability remains unavailable and does not consume a valid reference. The original user message remains in normal history; message-key replay is unchanged.

Bindings are stored in existing server-only execution metadata (`summaryJson._risk_page`) and restored across messages/process restarts. They commit with the Agent turn transaction. Only completed successful turns in the owned session qualify. Monotonic revisions order same-millisecond executions. The internal cursor mapping is not returned to the model; the public tool result contains only its opaque reference. No migration, credential, financial table or financial write tool is added.

An explicit next/more/continue request receives the current continuation/page size in server context. Otherwise the model starts without one; server validation remains decisive if it ignores instructions. Risk cards add optional `pagination`/recovery metadata outside shared financial models. Existing historical cards remain renderable. Home's `GET /api/plans/assessments` cursor contract and the explicit read-only frontend refresh fallback are unchanged.

Pages are fresh independent assessments, not a frozen multi-page export or combined budget. Pending-plan membership can change between pages; start from page one to include new plans. Reads and pending Saves do not reserve funds.

## Observed isolated verification

Checks used new migrated/seeded SQLite/private storage and actual Steve HTTP. Existing `.env`, SQLite/sidecars/uploads and configured Supabase were preserved. No private-database reset/reseed/migration occurred. One-off scripts/results are ignored local artifacts, not a permanent test suite.

| Check | Observed |
| --- | --- |
| First page / durable continuation | Seven Simulated plans paginated 3/3/1 through separate completed turns/runtimes: seven unique IDs, no overlaps. |
| Invented plan ID / legacy cursor | Plan UUID as continuation restarted with `UNKNOWN_OR_STALE_CONTINUATION`; retired `cursor` restarted with `INVALID_PAGINATION_INPUT`. First-page IDs matched service results. |
| Old flow / foreign session | Superseded references and another session's reference restarted safely. |
| Expiry / missing boundary / financial context | Isolated workflow-metadata injection exercised `EXPIRED_CONTINUATION`, `CURSOR_UNAVAILABLE` and `FINANCIAL_CONTEXT_CHANGED`; each returned genuine first-page data. No financial rows were modified for injection. |
| Explicit page-size change | Restarted with `PAGE_SIZE_CHANGED`, returning real data at the new size. |
| Real Groq | Server model `openai/gpt-oss-120b` selected `read_pending_plan_risks` with `limit` only for the originally failing request and returned five Would breach reserve assessments. Next request used the issued continuation/same limit and returned the other two. Another ordinary current-risk request omitted continuation and returned the first five again. This **5/2/5** journey used real Groq, not the scripted adapter. |
| Provider rate limit | An extra comparison request after the successful risk journey hit actual HTTP429 `AGENT_RATE_LIMITED`. It is not a pagination failure or successful comparison. No further model calls were needed for the HTTP regressions below. Earlier frontend/Groq comparison evidence remains in the frontend guide. |
| Compare / Agent Save / Home | A new isolated HTTP run used actual Steve Visa/KRW100000 comparison: 34374/34427/34427/35157 sen, in order. Trusted Agent proposal preview and two identical explicit Save calls returned one plan. Home/assessments both reported eight pending plans (seven setup fixtures plus one explicit Save), actual Above reserve. This Save regression used no inference. |
| Financial preservation | Complete account/activity/ledger-entry-and-lines/receivable/settlement fingerprints matched before/after reads, recoveries and Save. Only workflow metadata/pending plans were persisted. |

Harness corrections: compare stable plan IDs rather than fresh timestamped assessment objects, and respect Groq's valid selected page size rather than assuming three. A TypeScript null guard in page-size inheritance was fixed before final checks. These are not additional model journeys. Real-risk and later HTTP-regression runs are reported separately.

## Checks and remaining limits

Node build/type-check and backend/changed-source ESLint pass. Frontend oxlint and direct Vite asset bundling pass. **Full frontend build still fails on six existing calendar/resizable type errors.** Root lint retains **14 unrelated errors** (20 at Home/Compare checkpoint; replacing Agent removed six). No dependency upgrade, disabled check or suppression was introduced.

Provider rate limits/availability and model variability remain operational limits. Pricing/network evidence and OCR sample output remain Simulated. Authentication, live bank execution, receipt editing/uploads, Split/settlement UI and translation remain deferred. Existing dependency findings and legacy tracked `.venv` hygiene remain separately documented. This draft checkpoint must not be merged automatically.

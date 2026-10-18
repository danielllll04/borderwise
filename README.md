# BorderWise — Home, plans and Agent backend

**Status:** P1 (Home/Money & Ledger), P3 (plans/reserve warnings/completion), and P5 (Agent backend) are implemented. Real Groq behaviour remains **unverified**. Compare uses **simulated fixtures**. Authentication and card purchases remain **unsupported**.

Home (Priority 1), pending plans/reserve warnings/completion (Priority 3), and a read/preview Agent (Priority 5) for international students. The current demo implements MYR/KRW and three owned accounts. Built with TypeScript, Fastify 5, Prisma 6 and persistent SQLite. **Authentication is not implemented.** All APIs use the single seeded `demo-profile`; keep the default loopback host. Session/profile ownership checks are local demo boundaries, not production user isolation.

BorderWise records user-reported activity completed elsewhere. It never executes transfers, exchanges, card payments or ATM withdrawals. Seed data and quote fixtures are **Simulated**; completion amounts supplied through the plan API are labelled **User-Confirmed**. The Agent uses an optional Groq tool-calling adapter and cannot save/confirm/cancel plans, post a ledger entry or change a profile/reserve through chat. There are no frontend screens, Steve's Compare engine, Split UI, OCR, bank connections or live market integrations. Card purchase plans remain unsupported until a purchase ledger type is agreed.

**Priority 3 handoff:** [plan API guide and examples](docs/priority-3.md). It covers preview → acknowledge → save, revised quotes, actual completion, cancellation, stale checks and idempotency. The shared models in `src/shared/models.ts` are unchanged.

**Priority 5 handoff:** [Agent configuration, API and frontend examples](docs/agent.md). Groq credentials are optional for Home/plans. With no configured key/model the Agent returns an informative unavailable response; it never silently substitutes a scripted model.

## Setup (PowerShell)

Requires Node.js 22.14+ and npm. From this directory:

```powershell
Copy-Item .env.example .env
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://127.0.0.1:3000/api/home`. `.env.example` contains no secrets. `DATABASE_URL="file:./dev.db"` resolves relative to `prisma/schema.prisma`, so data lives at `prisma/dev.db` and survives server restarts. The migration commands first create the SQLite file if absent, without truncating existing data, to avoid a Prisma 6 Windows initialization error. The database and `.env` are ignored by Git. Restarting or seeding does not reset the database. Profile edits survive seed reruns.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server with reload |
| `npm run build` | Compile server and reusable services to `dist/` |
| `npm start` | Run compiled server (build first) |
| `npm run typecheck` | Check server and scripts |
| `npm run lint` | ESLint |
| `npm run db:generate` | Regenerate Prisma client (also runs on dependency installation) |
| `npm run db:migrate` | Apply checked-in migrations without resetting data |
| `npm run db:migrate:dev -- --name description` | Create a future development migration |
| `npm run db:seed` | Add/replay the fictional baseline safely |
| `npm run demo:post` | **LOCAL DEMO WRITE:** add/replay fictional MYR ATM and partial repayment |
| `npm run demo:plans` | **LOCAL DEMO WRITE:** use a running local API to demonstrate plan preview/save, actual completion/replay and cancellation; new plans each run |
| `npm run demo:agent` | Read/preview chat against a running API; persists sessions/messages/proposals only. `DEMO_AGENT_SAVE=true` opts into a separate frontend Save demonstration |

No tests have been written. The lint/build/type checks and local seed/demo scripts are the available verification commands. Prisma 6 is pinned together with its client; do not independently upgrade one to a new major version. SQL migrations also contain safe-integer, currency and non-negative checks plus immutable-plan-snapshot and terminal-status triggers that Prisma's schema syntax cannot express; preserve them in future migrations.

## Accounts and baseline

| Stable internal ID (also `LedgerEntry.lines[].account`) | Display name | Currency |
| --- | --- | --- |
| `myr_funding` | MYR Funding | MYR |
| `krw_card` | KRW Card | KRW |
| `krw_cash` | KRW Cash | KRW |

`demo-profile` starts with fixed-expense reserve **150000 sen (RM1,500)** and emergency reserve **50000 sen (RM500)**. Account identifiers are global for this single-profile phase; future multi-user account scoping will need an explicit migration.

Accounts are created at zero. Every seeded balance then comes through `LedgerService.post`:

1. Simulated funding income: +500000 MYR minor units.
2. Exchange: -100000 MYR principal, +300000 KRW received, separate -1200 MYR fee.
3. Card ATM withdrawal: -80000 KRW principal, +80000 KRW cash, separate -2000 KRW fee.
4. Partial repayment: clear 10000 KRW from the sample receivable and receive 3333 MYR minor units. This is a settlement, never income.

Fresh seed balances are **402133 MYR minor units**, **218000 KRW card**, **80000 KRW cash**, with six ledger entries in four activity groups. `demo-receivable-krw` retains its original **60000 KRW**; **10000 KRW** is settled and **50000 KRW** remains. This is an existing fictional receivable; the seed does not imply that receipt creation posts a financial transaction.

`demo:post` also records a MYR-funded ATM withdrawal (-5000 MYR principal, -100 MYR fee, +15000 KRW cash) and a 20000 KRW repayment into KRW Card. Afterwards balances are **397033 MYR minor units**, **238000 KRW card**, **95000 KRW cash**. The original receivable is still 60000 KRW and 30000 KRW remains. Both scripts use fixed payloads, badges and idempotency keys; reruns never duplicate their transactions. They print current Home values; replayed posting results intentionally retain the original response, which can show earlier balances.

## Money, provenance and accounting

The exact agreed shared TypeScript models live in **`src/shared/models.ts`**. Import them from that location for Steve's future integrations. Shared `Money` is `{ amount_minor, currency }`: sen for MYR and whole won for KRW. The capitalized `Money` keys in quote fees and ledger lines are preserved. Backend request types, persistence fields and response wrappers are separate from those shared models.

- Money inputs are JSON numbers validated as safe integers, from 0 to `Number.MAX_SAFE_INTEGER`. Transaction principal, received and settlement amounts must be strictly positive. Fees and reserves may be zero. Negative reserves and unsafe reserve totals are rejected.
- SQLite stores monetary columns as `BIGINT`; service calculations, debits, credits, totals and differences use `bigint`. Values convert to JSON numbers only after a safe-range check. Amounts exceeding SQLite's 32-bit Prisma `Int` range are supported.
- **Provisional convention to confirm with Steve:** ledger lines are signed. Positive increases that account; negative decreases it. Transaction input `Money` remains non-negative. A zero fee produces a zero-valued fee line. This is an account movement ledger, not a complete double-entry general ledger with equity/expense accounts.
- Never add MYR and KRW amounts together or require their numerical sum to equal zero. Balance reconciliation sums lines per account and currency.
- Exchanges debit actual principal and credit the separately supplied actual received amount. Exchange currencies must differ. ATM sources are MYR Funding or KRW Card, and destination is KRW Cash. Same-currency ATM principal and received amounts must match; any loss is an explicit fee.
- Each fee has an explicit paying account, currency, label, amount and badge in the internal posting input. Fees are persisted as separate `fee` expense entries linked to the same activity group. The original label and provenance remain in the activity's actual-input record.
- Fee currencies must match their paying accounts. Posting checks final balances after all principal movements and fees in the atomic activity. A fee may be paid from the destination's newly received funds. A negative resulting account rejects the whole activity. Crossing a MYR reserve is allowed.
- Settlement credits the repayment account and advances the linked receivable's internal `settledMinor`. `amount_cleared` is in the original receipt currency; `amount_received` is in the repayment account's currency. Different currencies may have different actual amounts; neither is inferred from a rate. Same-currency amounts must match, with fees recorded separately. The original amount never changes; `settled` becomes true only on full settlement. Over-settlement rolls everything back.
- Each activity, all principal/fee entries, balance/provenance updates, settlement progress and replay response commit in **one database transaction**. No service other than `LedgerService` writes nonzero balances or ledger entries. The seed creates initial zero accounts and receivable metadata only.
- The global idempotency key is unique. Validated payloads are canonicalized (object key order is ignored; trimmed text is normalized; array order is retained), hashed and stored. Same key + same payload returns the **original result**, including original badges/IDs/balances. A changed payload gives `IDEMPOTENCY_CONFLICT` (409). Reuse the original timestamp too. Concurrent lock conflicts return a retryable `DATABASE_BUSY` (503) if a completed result cannot already be replayed. No partial writes survive a rejection.

**Provenance:** user-facing monetary values in Home/profile/balances use `{ Money, badge }`. A ledger entry's badge covers its signed lines; the containing actual activity's badge covers principal, received and clearing amounts. Each fee and rate snapshot has its own badge. Settlement results separately wrap cleared, received and remaining values, with an `amount_badge` beside the original shared `Receivable.amount`. Shared Money objects never gain a badge field.

Backend responses always populate `Badge.source`; timestamps are ISO 8601 with timezone (`Z` or an offset for supplied inputs). Profile reserve edits get a backend-generated `User-Entered` badge; callers cannot mark those values Live. Posting is an internal trusted boundary and requires badge source and timestamp for every input. A badge describes provenance, not whether a transaction completed; fictional demo postings are completed records with Simulated provenance.

Derived values describe their formula in `source`. Conservative status propagation chooses the first status present in this order: **Simulated, Indicative, User-Entered, User-Confirmed, Live**. Live is returned only when every contributing input is Live. Account balance badges include previous-balance and applicable movement/fee badges. Internal activity provenance stores prior balance, signed delta and input badges; account provenance points to that activity. Remaining receivable provenance uses the original amount badge and every clearing activity, retained in Activity/Settlement records. Budget calculations retain source account/reserve values and badges internally and read those persisted inputs in the same database snapshot. Actual received amounts do not derive from supplied rates, so an indicative rate snapshot stays independently labelled and cannot be used to manufacture actual amounts.

## Budget status

Only **MYR Funding** contributes. KRW Card/Cash do not offset MYR reserves.

```text
TotalReserve          = FixedReserve + EmergencyReserve
AvailableAboveReserve = MYR Funding Balance - TotalReserve  (signed)
MaxSafeTotalDebit     = max(0, AvailableAboveReserve)
ReserveShortfall      = max(0, TotalReserve - MYR Funding Balance)
```

Positive/zero/negative availability means `Above reserve` / `At reserve` / `Below reserve`. The fresh seed returns total reserve 200000, available 202133, max safe total debit 202133 and shortfall 0, all MYR minor units. Setting total reserves above the balance is permitted and returns a signed negative availability. Home and plan workflows share `src/services/budget.ts`; plan flows require explicit acknowledgement when a projected MYR debit breaches reserves.

## API

Default base URL: `http://127.0.0.1:3000`. All response examples are representative; timestamps, generated IDs and derived source descriptions reflect the actual activity.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/health` | Local mode and authentication notice |
| GET | `/api/profile` | Demo profile and reserves |
| PATCH | `/api/profile` | Update display name and/or either reserve; return full profile |
| GET | `/api/balances` | Three balances with badges |
| GET | `/api/ledger?limit=20&cursor=<entry_id>` | Ledger history, newest first; default 20, maximum 100 |
| GET | `/api/home` | Consistent snapshot of profile, balances and budget |
| POST | `/api/plans/preview` | Validate a selected quote and preview Modal A; no writes |
| POST | `/api/plans` | Idempotently save a pending plan; no ledger/balance effects |
| GET | `/api/plans?status=pending&limit=20&cursor=<plan_id>` | Filtered, paginated plan history |
| GET | `/api/plans/:planId` | Shared Plan plus separate workflow metadata |
| POST | `/api/plans/:planId/cancel` | Cancel a pending plan; status only |
| POST | `/api/plans/:planId/completion-preview` | Validate actual completed amounts and preview Modal B; no writes |
| POST | `/api/plans/:planId/confirm` | Explicitly confirm actual activity; atomic ledger posting and completion |

There are **no unrestricted HTTP ledger-writing routes**. Only explicit confirmation of a pending plan can post exchange/ATM activity through HTTP. Unknown request properties, unsupported currencies, decimal/unsafe amounts, empty profile updates and invalid cursors are rejected. Request body limit is 32 KiB. All routes use the same seeded profile; no client-supplied profile ID or authentication header selects another user.

### Read/update profile

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/profile
$body = @{
  display_name = 'Daniel'
  fixed_expense_reserve = @{ amount_minor = 150000; currency = 'MYR' }
  emergency_reserve = @{ amount_minor = 50000; currency = 'MYR' }
} | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri http://127.0.0.1:3000/api/profile -ContentType application/json -Body $body
```

PATCH accepts **Money** for reserve inputs, not the read response's wrapper. A representative response:

```json
{
  "profile_id": "demo-profile",
  "display_name": "Daniel",
  "home_currency": "MYR",
  "destination_currency": "KRW",
  "fixed_expense_reserve": {
    "Money": { "amount_minor": 150000, "currency": "MYR" },
    "badge": { "status": "User-Entered", "source": "Fixed-expense reserve entered through the local demo profile API", "timestamp": "2026-10-18T08:00:00.000Z" }
  },
  "emergency_reserve": {
    "Money": { "amount_minor": 50000, "currency": "MYR" },
    "badge": { "status": "User-Entered", "source": "Emergency reserve entered through the local demo profile API", "timestamp": "2026-10-18T08:00:00.000Z" }
  },
  "updated_at": "2026-10-18T08:00:00.000Z"
}
```

### Balances and Home

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/balances | ConvertTo-Json -Depth 10
Invoke-RestMethod http://127.0.0.1:3000/api/home | ConvertTo-Json -Depth 10
```

`/api/balances` returns `{ "balances": [...] }`. Each item looks like:

```json
{
  "account_id": "myr_funding",
  "display_name": "MYR Funding",
  "balance": {
    "Money": { "amount_minor": 402133, "currency": "MYR" },
    "badge": { "status": "Simulated", "source": "Previous MYR Funding balance + signed ledger lines for activity <activity_id>; includes principal and separate fees", "timestamp": "2026-10-18T08:00:00.000Z" }
  }
}
```

`/api/home` returns `{ "profile": <profile response>, "balances": <same balances array>, "budget": <object below> }`:

```json
{
  "status": "Above reserve",
  "badge": { "status": "Simulated", "source": "Compare MYR Funding balance with fixed-expense reserve + emergency reserve; KRW accounts are excluded", "timestamp": "2026-10-18T08:00:00.000Z" },
  "total_reserve": {
    "Money": { "amount_minor": 200000, "currency": "MYR" },
    "badge": { "status": "Simulated", "source": "FixedReserve + EmergencyReserve", "timestamp": "2026-10-18T08:00:00.000Z" }
  },
  "available_above_reserve": {
    "Money": { "amount_minor": 202133, "currency": "MYR" },
    "badge": { "status": "Simulated", "source": "MYR Funding balance - (FixedReserve + EmergencyReserve); signed value", "timestamp": "2026-10-18T08:00:00.000Z" }
  },
  "max_safe_total_debit": {
    "Money": { "amount_minor": 202133, "currency": "MYR" },
    "badge": { "status": "Simulated", "source": "max(0, MYR Funding balance - TotalReserve)", "timestamp": "2026-10-18T08:00:00.000Z" }
  },
  "reserve_shortfall": {
    "Money": { "amount_minor": 0, "currency": "MYR" },
    "badge": { "status": "Simulated", "source": "max(0, TotalReserve - MYR Funding balance)", "timestamp": "2026-10-18T08:00:00.000Z" }
  }
}
```

### Ledger pagination

```powershell
$page = Invoke-RestMethod 'http://127.0.0.1:3000/api/ledger?limit=2'
$page | ConvertTo-Json -Depth 12
if ($page.next_cursor) {
  Invoke-RestMethod "http://127.0.0.1:3000/api/ledger?limit=2&cursor=$($page.next_cursor)"
}
```

Response: `{ "items": [...], "next_cursor": "<last entry UUID>" }` or `null` when exhausted. Each item contains the unchanged shared `entry`, separate `activity_id`, `created_at`, and internal `activity` actual-input record (the same metadata can occur beside both a principal and fee entry). For example, a shared fee entry inside an item is:

```json
{
  "entry_id": "<entry UUID>",
  "type": "fee",
  "lines": [{ "account": "myr_funding", "Money": { "amount_minor": -1200, "currency": "MYR" } }],
  "badge": { "status": "Simulated", "source": "BorderWise local demo seed; fictional balances and activity", "timestamp": "2026-10-18T00:00:00.000Z" }
}
```

Pagination uses `(createdAt, entry_id)` descending with an exclusive boundary. The cursor must be an existing ledger entry UUID. Activity grouping is separate from the shared entry model and works across page boundaries. The API does not claim historical event-time ordering for identical creation timestamps.

### Errors

All errors use the same envelope, including malformed JSON, unsupported content types, unknown routes and internal failures:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "path": "fixed_expense_reserve.amount_minor", "message": "Number must be greater than or equal to 0" }],
    "request_id": "req-1"
  }
}
```

`details` is optional. HTTP validation errors use 400, missing records 404, business/idempotency/reserve acknowledgement conflicts 409, invalid accounting/currency/range combinations or unsupported objectives 422, database contention 503 and unexpected failures 500. Internal service calls throw `AppError` or Zod validation errors. Plan confirmation is the only HTTP posting adapter.

## Posting service and integration boundaries

`src/services/ledger.ts` exports `LedgerService` and `PostingResult`. `src/services/posting-inputs.ts` exports distinct **internal** validated inputs for income, exchange, ATM and settlement. `scripts/demo-post.ts` is the runnable local example. A representative internal call:

```typescript
const result = await ledger.post({
  kind: 'exchange',
  profile_id: 'demo-profile',
  idempotency_key: 'caller-generated-stable-key',
  source_account: 'myr_funding',
  destination_account: 'krw_card',
  principal: { amount_minor: 10000, currency: 'MYR' },
  received: { amount_minor: 29800, currency: 'KRW' },
  fees: [{
    label: 'User-reported provider fee',
    account_id: 'myr_funding',
    Money: { amount_minor: 100, currency: 'MYR' },
    badge: { status: 'User-Confirmed', source: 'Completed activity entered by user', timestamp: '2026-10-18T08:00:00.000Z' },
  }],
  badge: { status: 'User-Confirmed', source: 'Completed activity entered by user', timestamp: '2026-10-18T08:00:00.000Z' },
});
```

For settlement, use `kind: 'settlement'`, `receivable_id`, `receiving_account`, `amount_cleared`, `amount_received`, `fees`, common profile/key/badge, and optional `rate_snapshot`. The demo contains both cross-currency and same-currency partial repayments. The posting result contains activity ID, shared ledger entries, balance wrappers, and (for settlement) original receivable plus separately badged clearing/received/remaining values.

`src/integrations/interfaces.ts` exposes internal integration ports; `PlanService` now supplies the plan operations:

- Preview a selected shared Quote with separate routing and fee-behavior context.
- Save a pending shared Plan as metadata only, without posting or reserving funds.
- Confirm a pending plan using actual exchange/ATM inputs, with transaction-bound ledger posting.
- Receive a future Split settlement using original-currency clearing and actual repayment values; no Split HTTP workflow is implemented.

`LedgerService.prepareInTransaction` validates/projects without writes; `postInTransaction` lets the plan service commit actual ledger activity, completion metadata and workflow replay together. Direct `LedgerService.post` still serves the existing seed/demo and future Split adapter. Compare and Split must not write the ledger or balances directly. Saving a quote or plan never posts financial activity. The Agent reuses Home/plan services without a separate accounting implementation.

## Provisional contract questions for Steve

The agreed field names are unchanged. These assumptions are isolated and need agreement before deeper integration:

1. Confirm signed `LedgerEntry.lines[].Money.amount_minor` while transaction-input Money remains non-negative, and confirm stable account IDs rather than display names in `account`.
2. `objective`, `mode`, `funding_source` and `provider` are currently free-text string aliases. Agree the vocabulary without adding competing enums.
3. Rate representation is provisionally a **positive base-10 decimal string**, with `pair` formatted `MYR/KRW` (or reverse; internal validator also accepts same-currency pairs). Rate means quote major units per one base major unit, e.g. `MYR/KRW: "300"` means RM1 → ₩300. Internal validation uses `decimal.js`; rates are retained verbatim, never used to derive actual received amounts. Confirm this representation, pair direction and units. No quote calculations are implemented.
4. Confirm the `{ Money, badge }` response wrapper, conservative mixed-provenance rule and activity metadata outside the exact shared models. The shared Badge keeps optional source, but backend-generated responses and internal posting inputs always supply it.
5. Confirm Split will send both original-currency `amount_cleared` and actual `amount_received`, with fees explicit. The shared Receivable keeps its original amount; partial progress is internal and exposed separately where needed.

6. The isolated Compare adapter currently recognizes free-text objectives `exchange` / `atm_withdrawal` and stable account IDs in `funding_source`. Confirm those mappings, the separate-account-fee interpretation of `total_debit` and `net_received`, and who supplies fixed-fee assertions. They are adapter assumptions, not new shared enums. Card purchase support needs an agreed ledger representation first.

## Agent configuration and boundaries

Configure `GROQ_API_KEY` and `GROQ_MODEL` only in the server environment or ignored `.env`. Select an available Groq model supporting local function calling; no current model name is assumed. Existing Node `fetch` handles HTTPS requests; no model SDK was added. See [Groq local tool calling](https://console.groq.com/docs/tool-use/local-tool-calling) and its [supported models](https://console.groq.com/docs/models).

For explicitly scripted development, start the server with `AGENT_PROVIDER=demo`. Responses visibly label this as a demo, not real Groq. `AGENT_DEMO_FAILURE=rate_limit` or `unavailable` simulates provider failure in this mode. No Groq credentials were available during local verification; real Groq behavior remains unverified.

The Agent reuses Home/plan services and a small Compare interface. Its fixtures are complete static examples, never scaled or described as live provider offers. Proposals reference immutable server snapshots; a separate frontend re-preview and Save route delegates to Priority 3 with an in-transaction stale check and any required acknowledgement. Chat messages cannot trigger that route. Completion and cancellation remain outside Agent authority. Shared financial models are unchanged. See the Agent handoff for remaining Steve/frontend work and limitations.

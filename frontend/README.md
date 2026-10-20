# BorderWise frontend
React + TypeScript + Vite + Tailwind. Tabs: Home, Compare, Split, Agent, ATM & Alerts (EN/中文).

Run Node and Steve's Python service using the root [README](../README.md), then from this folder:

```powershell
if (!(Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
npm ci
npm run dev -- --host 127.0.0.1
```

Live mode is the default; `VITE_USE_MOCK=true` explicitly selects the older in-memory demo. Manual Compare is disabled in that mode rather than silently returning fixtures. In live mode the browser uses same-origin `/api`; Vite proxies to Node at `http://127.0.0.1:3000`. If that port is occupied, set server-only `$env:BORDERWISE_DEV_API_TARGET='http://127.0.0.1:<Node port>'` in the terminal launching Vite. Keep Node/Steve bound to loopback; authentication is not implemented.

`VITE_API_BASE_URL` may contain only a public HTTPS (or loopback HTTP) backend root without credentials/query/fragment. Same-origin reverse-proxy routing is preferred for deployment; remote browser calls need deployment CORS configuration. Never expose Groq keys or database URLs as `VITE_*` variables. Existing `.env` files are not overwritten by setup.

All network code: `src/api/api.ts` (live) and `src/api/mock.ts` (same contract).
Manual Compare now calls Node's shared Steve adapter, renders backend ranking/amounts/fees/compatibility/provenance and saves through trusted proposal preview/Save. Pricing stays Simulated. Unsupported card purchases and KRW-funded engine requests are explicit. The existing layout/branding and refresh convention are retained. See [manual Compare contract, UI checks and current build limitations](../docs/manual-compare.md).

Home now reads Node profile, balances, reserves, ledger, pending plans and independent risk assessments. It keeps MYR/KRW separate, displays provenance and uses existing completion-preview/confirmation/cancellation routes. Actual principal, received amount, separate fees, owned accounts and completion time are reviewed explicitly; financial differences and reserve warnings come from Node. Retried confirmation preserves its key and exact submitted body. Successful posting is separate from fallible read refreshes. See [Home contracts, observed running-UI checks and remaining build blockers](../docs/home-integration.md). Explicit mock mode also leaves authoritative Home unavailable.

Receipt/settlement screens and Agent scripted starter flows remain outside this integration. The older `src/api/compare.ts` is retained for those existing demo callers; manual Compare does not import it.

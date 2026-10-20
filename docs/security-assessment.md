# Security Self-Assessment Report: BorderWise 

## Purpose and scope

BorderWise is a multilingual, AI-powered cross-border financial decision-support platform designed to help international students optimize foreign-exchange and ATM costs, manage multi-currency expenses, and safeguard essential living reserves through transparent, user-confirmed financial workflows. It does not execute bank transfers, card payments, exchanges, or ATM withdrawals. The system uses intentionally simulated comparison, ATM, alert, and OCR data for reproducible evaluation.

This assessment describes the security boundaries implemented in the MVP and the controlled limitations that are deliberately deferred to a production phase.

## Architectural security and permission tiers

BorderWise separates orchestration, calculation, and financial recording into distinct permission tiers. A lower-trust tier cannot directly bypass a higher-trust boundary.

### Tier 1 — AI orchestration

- The Agent is treated as zero-trust orchestration, not a financial authority.
- Agent tools can read backend data, request clarification, compare options, preview trusted proposals, and help prepare receipt-review metadata.
- The Agent has no tool that can save a plan, cancel a plan, confirm a completion, confirm a shared expense, post a ledger entry, or confirm a repayment.
- Financial actions require an explicit UI route and validated user-confirmation fields; conversational approval alone is not sufficient.
- Agent/model output is treated as untrusted input. It cannot choose service URLs, set fees, perform FX calculations, create authoritative allocation amounts, or override reserve checks.
- This zero-trust design enforces the principle of least privilege; the Agent has only the permissions necessary to read context and orchestrate stateless tools, ensuring strict separation of duties between AI assistance and financial execution.

The Agent may persist its own sessions, messages, and non-financial review/proposal context. That audit/history state is intentionally separate from authoritative financial posting.

### Tier 2 — Stateless financial engine

- Python FastAPI supplies deterministic comparison, ATM/alert, sample OCR, and allocation-preview calculations.
- The integrated Node workflow calls only side-effect-free Python endpoints for receipt OCR and allocation preview. Python is not connected to the Node/Prisma authoritative ledger.
- Financial amounts are represented as validated integer minor units. Python request and response schemas use strict Pydantic validation, while Node independently validates currency, identity, totals, and reconciliation invariants before a result can become a trusted proposal.
- Python’s current OCR is explicitly a deterministic sample fallback. It reports that it did not interpret uploaded image content.
- Legacy Python-only Split/receivable endpoints are retained for compatibility and diagnostics but are not integrated financial writers. The frontend and Node ledger do not use or replay their state/events.
- Because Python request schemas use strict Pydantic validation and Node validates identities and totals, adversarial inputs or prompt injection attempts by the user cannot force the financial engine to process malformed or unauthorized data.

This prevents a calculator, OCR result, or allocation preview from becoming a ledger entry by itself.

### Tier 3 — Authoritative ledger

- Node.js with Prisma is the sole authoritative writer for balances, ledger entries, plans, shared expenses, receivables, and repayments.
- Financial mutation routes are narrow and explicit. Shared-expense confirmation and repayment confirmation require the documented frontend actions, strict payload schemas, ownership checks, and current-state validation.
- Receipt allocation remains a review-only proposal until the user explicitly acknowledges both receipt and allocation review through the confirmation route.
- Stable idempotency keys and payload hashes protect retries from creating duplicate debits, receivables, settlements, or plan records.
- Financial posting, ledger updates, and durable confirmation results are transactionally coordinated. A failed validation or reconciliation check rolls back rather than inventing a balancing entry.

## Data provenance and integrity controls

### Badge-based provenance

Financial and decision-facing values carry `Badge` metadata describing their status, source, and timestamp. The UI and backend distinguish, rather than blur, data such as:

- **Simulated** — deterministic local fixtures, seeded comparisons, sample OCR, and demo data.
- **Indicative** — non-final calculation/preview information that still requires review.
- **User-Entered** or **User-Confirmed** — information supplied or explicitly confirmed through the designated workflow.

An acknowledgement does not upgrade simulated or indicative source data into live/provider-verified data. This keeps the demo honest about what is calculated, recorded, or merely illustrative.

### Side-effect-free previews

- Python comparison and allocation operations are previews, not postings.
- Node preview routes calculate reserve impact and validate trusted selections without changing confirmed balances.
- Saving a pending plan does not change balances, ledger entries, or receivables.
- Receipt upload, extraction, correction, and allocation review do not create financial records.
- Only explicit Node confirmation routes can record a shared expense or repayment.

The system also preserves immutable snapshots and version bindings for reviewed receipts and proposals. Editing a receipt invalidates earlier allocation proposals instead of silently applying stale amounts.

## Known risks and mitigation roadmap

### User session segregation

For demo evaluation, BorderWise intentionally uses a stable `DEMO_PROFILE_ID` and local-development ownership checks. This makes the demo reproducible but is not production multi-user authentication or authorization.

- **MVP control:** services are intended to run on loopback, with a single seeded demo profile and scoped session identifiers.
- **Production roadmap:** replace the stable demo identity with JWT/OAuth2-backed authentication, tenant-scoped database queries, authenticated participant/contact directories, and production storage/access controls.

### Dependency updates

The MVP uses locked Node and Python dependencies to keep the evaluation environment reproducible and stable.

- **MVP control:** dependency versions are pinned and build/type/lint checks are retained; no security check is disabled to make the demo pass.
- **Production roadmap:** introduce automated DevSecOps maintenance, including Dependabot, scheduled vulnerability scanning, and reviewed upgrade windows for major dependencies such as Prisma.

### External data

The prototype uses sanitized fixtures for exchange comparisons, ATM data, alerts, and OCR. This provides reproducible demonstrations without representing seeded data as live market, banking, or merchant information.

- **MVP control:** simulated provenance remains visible, trusted server configuration controls adapter URLs, and response schemas validate bounded external data.
- **Production roadmap:** use TLS-verified, authenticated live API integrations; implement payload signature validation to ensure data integrity in transit, add provider onboarding.

### Additional controlled MVP boundaries

- Real bank execution, payment initiation, live OCR, and live ATM availability are out of scope.
- Receipt uploads are private local files in the MVP, with bounded image validation and retention cleanup; production storage, malware scanning, retention policy, and authenticated access remain future work.
- Cross-currency shared-expense payment recording, arbitrary fee/FX inference, and existing-payment linking are intentionally rejected rather than guessed.

## Security posture summary

BorderWise prioritizes a conservative financial boundary: the AI can assist but cannot post, Python can calculate but cannot write the Node ledger, and Node posts only after explicit, validated, idempotent user-confirmation workflows. Simulated data is clearly labelled, previews remain side-effect free, and unsupported financial semantics fail safely instead of being inferred.

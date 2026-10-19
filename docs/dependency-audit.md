# Dependency audit and compatible remediation — 2026-10-19

Inspected package.json, lockfile v3, installed package manifests, `npm ls --all`, `npm explain`, full audit JSON, production-only audit JSON and upstream advisories/releases. This pass changes dependency pins/lockfile and documentation only; application behavior, shared contracts, schema and migration SQL are unchanged. Earlier uncommitted application work was preserved.

## Before and after

| View | Before | After |
| --- | --- | --- |
| Full npm audit | 13 high package findings | 3 high package findings |
| Production audit (`--omit=dev`) | 4 high package findings in the preceding receipt-step audit of the same baseline | 3 high package findings |
| Distinct underlying advisories in the full report | 3 | 1 |

The remaining three package entries are **one deepmerge-ts advisory propagated to @prisma/config and prisma**, not three independent vulnerabilities. `npm audit` and `npm audit --omit=dev` still exit nonzero. No finding was suppressed, ignored through audit configuration, or hidden by changing dependency classification. No `npm audit fix --force`, major upgrade or dependency override was used.

Changes applied:

| Package | Before | After | Compatibility and effect |
| --- | --- | --- | --- |
| `typescript-eslint` | 8.46.3 | 8.71.2 | Same major; matches installed ESLint 9.39.1, TypeScript 5.9.3 and Node 22.14.0. Updates its matched parser/plugin/utilities and replaces the fast-glob dependency path with tinyglobby. Removes all 9 lint-chain findings. |
| `prisma` | 6.19.0 | 6.19.3 | Same release line; upstream security patch updates Effect. Config/engines also become 6.19.3. |
| `@prisma/client` | 6.19.0 | 6.19.3 | Kept exactly matched to CLI; client regenerated successfully. |
| `effect` (transitive) | 3.18.4 | 3.21.0 | Selected by @prisma/config 6.19.3; resolves the Effect advisory without an override. |
| `deepmerge-ts` (transitive) | 7.1.5 | 7.1.5 | Still pinned by @prisma/config; unresolved. The published 7.1.6 is also in the advisory's `<8.0.0` affected range and is not an audit fix. |

The [Prisma 6.19.3 release](https://github.com/prisma/orm/releases/tag/6.19.3) explicitly identifies its Effect security update. The selected [TypeScript ESLint 8.71.2 release](https://github.com/typescript-eslint/typescript-eslint/releases/tag/v8.71.2), registry peer constraints and installed tree were checked. package-lock.json records the exact resulting dependency graph. `npm ci` reproduced it and regenerated Prisma Client 6.19.3 through the existing postinstall hook.

## Every original package finding

All 13 original entries were high severity. Paths below start at this project's root. Versions are the original installed versions. A representative path is shown for each shared node; parser/plugin/type-utils/utilities share the same installed typescript-estree/glob nodes.

Environment labels:

- **D**: development-only lint dependency in the lockfile.
- **D/P\***: Prisma CLI is explicitly a devDependency, but production `@prisma/client` has an optional peer on `prisma`. npm retains/classifies the installed CLI/config subtree in the production audit too. These entries must not be dismissed as absent from the production install simply because the root declaration says dev. Application reachability is assessed separately below.

| Affected package | Dependency path | Environment | Relevant vulnerability and practical exposure | Available fix / breaking change / outcome |
| --- | --- | --- | --- | --- |
| `typescript-eslint@8.46.3` | root → typescript-eslint | D | Inherits braces nested-pattern stack exhaustion through parser/plugin/utilities. Lint/CI path, not an HTTP handler. | 8.71.2, same major; applied. No longer reported. |
| `@typescript-eslint/eslint-plugin@8.46.3` | root → typescript-eslint → eslint-plugin | D | Inherits the same braces issue through type-utils/utils. Developer-controlled lint patterns here. | Matched 8.71.2 via parent; compatible and applied. No longer reported. |
| `@typescript-eslint/parser@8.46.3` | root → typescript-eslint → parser | D | Inherits braces through typescript-estree. Used to lint source, not receipts or financial API input. | Matched 8.71.2 via parent; compatible and applied. No longer reported. |
| `@typescript-eslint/type-utils@8.46.3` | root → typescript-eslint → eslint-plugin → type-utils | D | Inherits braces through typescript-estree/utils. Potential tooling denial of service if hostile patterns reach the old glob implementation. | Matched 8.71.2 via parent; compatible and applied. No longer reported. |
| `@typescript-eslint/typescript-estree@8.46.3` | root → typescript-eslint → typescript-estree | D | Brings in fast-glob → micromatch → braces. Current eslint.config.js uses static file globs and no type-aware project glob supplied by API users. | 8.71.2 uses tinyglobby instead of that chain; compatible and applied. No longer reported. |
| `@typescript-eslint/utils@8.46.3` | root → typescript-eslint → utils | D | Inherits braces through typescript-estree; same tooling-only exposure. | Matched 8.71.2 via parent; compatible and applied. No longer reported. |
| `fast-glob@3.3.3` | root → typescript-eslint → typescript-estree → fast-glob | D | Aggregate finding through micromatch/braces, not a separate advisory. Not imported by app services. | Remove vulnerable path through the compatible TypeScript ESLint update; applied. Package removed from this tree. |
| `micromatch@4.0.8` | root → typescript-eslint → typescript-estree → fast-glob → micromatch | D | Aggregate finding through braces recursion; no client-supplied glob endpoint exists. | Same parent update removes this path. No breaking leaf override used. Package removed. |
| `braces@3.0.3` | root → typescript-eslint → typescript-estree → fast-glob → micromatch → braces | D | GHSA-vfj7-8cjw-p6xm / CVE-2026-93687: deeply nested brace patterns can exhaust the stack. Risk was lint/config/CI availability rather than a demonstrated request path. | Advisory lists no patched braces release. Compatible parent update removes its use; applied. Package removed. |
| `effect@3.18.4` | root → prisma → @prisma/config → effect; also @prisma/client → optional peer prisma → same path | D/P* | GHSA-38f7-945m-qr2g / CVE-2026-32887: fiber scheduling can mix AsyncLocalStorage request contexts. Here it is a config-loader dependency; no Effect RPC/HTTP/auth integration was found in application code. | Patched >=3.20.0; matched Prisma/client 6.19.3 selects Effect 3.21.0. Compatible patch applied. No longer reported. |
| `deepmerge-ts@7.1.5` | root → prisma → @prisma/config → deepmerge-ts; also production client's optional-peer path | D/P* | GHSA-ggr8-5vv4-36mx / CVE-2026-40345: cyclic object graphs can exhaust recursive merges. Current use is Prisma configuration loading, not account/receipt JSON handling. | Library fix 8.0.0 is a major; supported npm parent fix is Prisma 7.10.1, also a major. No safe parent-compatible patched dependency is available in the selected Prisma 6 line. Remains high. |
| `@prisma/config@6.19.0` | root → prisma → @prisma/config; also production client's optional-peer path | D/P* | Originally inherited both Effect and deepmerge findings. It loads local Prisma configuration; no direct app-service import. | 6.19.3 removes the Effect exposure but still pins deepmerge 7.1.5. Partial compatible fix applied; remains high through deepmerge. |
| `prisma@6.19.0` | root devDependency prisma; production @prisma/client → optional peer prisma | D/P* | Aggregate config-loader finding, not an independent query-engine or ledger vulnerability in this report. CLI runs for generation/migrations. | 6.19.3 applied with client 6.19.3; remaining supported audit fix requires 7.10.1+. Remains high. |

Upstream primary advisories: [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [Effect](https://github.com/advisories/GHSA-38f7-945m-qr2g), [deepmerge-ts](https://github.com/advisories/GHSA-ggr8-5vv4-36mx). The lint/config wrapper entries are dependency propagation, not extra CVEs. Removal of the braces chain is genuine dependency removal, not a patched-version claim about braces itself.

## Remaining exposure and next action

The unresolved deepmerge issue needs recursive JavaScript object graphs, including matching self-references in merged objects. Ordinary JSON alone cannot express those cycles. Installed @prisma/config source dynamically imports deepmerge while loading local Prisma configuration. There is no prisma.config.ts/js in this repository and no app/service import of @prisma/config, deepmerge-ts or Effect. The exercised app process also had none of these CommonJS modules loaded; Prisma CLI checks ran in separate processes. These observations support **low observed HTTP reachability in this app**, not proof that exploitation is impossible. The remaining concrete risk is a CLI/build/migration process crash if recursive/untrusted programmatic config objects reach the loader. Future config/plugin integrations can change that exposure. The affected package remains installed and audit-visible.

Recommended next action: perform a separate reviewed, paired Prisma/client migration to **7.10.1 or a newer verified fixed release**, or consume an upstream Prisma 6 backport if one becomes available. Follow the [official Prisma 7 migration guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7): configuration/generator/client construction and SQLite driver-adapter changes need deliberate review of src/db.ts and demo scripts. Verify Node support, transaction/idempotency behavior, migration SQL checks/triggers, data preservation and rollback on a database copy before any financial-database deployment. Do not force deepmerge 8 underneath Prisma 6 or change audit policy to make the remaining findings disappear. Until that migration, keep Prisma config and CLI execution trusted and do not expose them as service APIs. Continue reporting the nonzero audit result.

## Checks actually performed

- Inspected root declarations, lockfile v3, installed manifests and npm explain paths; checked selected release metadata/peer requirements.
- Installed exact compatible versions, then `npm ci`. Its existing postinstall successfully regenerated matched Prisma Client 6.19.3. No major, forced audit fix, audit suppression or override.
- `npm run build`, `npm run typecheck`, `npm run lint`: passed without changing application code or disabling lint rules.
- Existing `demo:post`, `demo:plans`, `demo:agent` and `demo:split`: passed using disposable SQLite databases only. The first three were explicitly pointed at the temporary DB/server; demo:split creates its own isolated DB. Demo Agent mode was forced and Groq credentials removed from child environments. No real Groq call.
- Prisma `validate`, `migrate deploy` and `migrate status`: passed on a new temporary database. All **5** checked-in migrations were applied and every stored checksum matched its SQL file. Re-running migrate deploy on populated temporary data left every stored row unchanged and preserved the plan/receipt immutable/terminal guard triggers.
- Existing pending-plan assessment reads and scripted risk cards passed. Receipt image upload, extraction/review, adapter allocation, explicit confirmation, exact 15000/35000 expense/receivable split, history and idempotent replay passed with the updated ORM.
- Configured financial SQLite files (and any pre-existing journal/WAL/SHM files) were fingerprinted by reading bytes, without opening that database. Final size/SHA-256 comparisons were identical and no new sidecar appeared. No migrate/reset/seed/demo ran against the financial database.
- Disposable verification orchestration and temporary databases/images were removed. No feature or test suite was added. Raw before/after audit JSON and fictional demo logs are in Git-ignored `.local/dependency-audit/` for local inspection.

`npm ls --all` also reports @img/sharp-wasm32 0.35.5, @emnapi/runtime 1.11.3 and tslib 2.8.1 as extraneous on this Windows installation, even immediately after npm ci. All three are optional cross-platform entries present in the lockfile, not new root dependencies or audit findings. The Windows image path passed decoding/upload checks. No packages were manually deleted to hide this diagnostic. npm additionally warns that pinned ESLint 9.39.1 is out of support; that is separate from the resolved lint-chain advisory and warrants a deliberate future ESLint-major maintenance review.

This is dependency-advisory remediation, not a complete security audit. A clean future npm audit would not establish that the application is vulnerability-free; authentication, deployment exposure and live integrations retain their separately documented limitations.

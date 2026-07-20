# SAG2026 — Session Primer

_Rewritten 2026-07-19. Read this first to resume with minimal ramp-up._

## Repo state
- Branch: `main`. All work below is committed AND pushed to `origin/main`.
- **All 4 GitHub workflows are GREEN** on main: Build & Deploy, Lint & Code Quality, Unit & Integration Tests, Security Scanning.
- Test suite: **852 passing** (`npx jest`). Lint: `npm run lint` exits 0.
- Stack: Node/Express, PostgreSQL via `pool`, vanilla JS frontend (no build step), Jest + supertest. CommonJS. Live site: SAG.live (VPS, manual redeploy).

## What this session shipped (newest first)
1. **Security/quality linting (ratcheted)** — ESLint now enforces industry best practices on NEW/changed code:
   - Plugins: `eslint-plugin-security`, `-n` (v17 — v18 is ESM-only and breaks Node-18 CI, keep v17), `-promise`, `-sonarjs`.
   - Security rules are ERRORS (new eval/injection/ReDoS/child_process/weak-random/insecure-crypto/cleartext holes fail lint). `security/detect-object-injection` off (noisy); subjective sonarjs style rules kept `warn`.
   - Existing ~100 findings grandfathered in `eslint-suppressions.json` (the ratchet). CI green now.
   - Scripts: `npm run lint` (enforce, tolerates unpruned), `lint:fix`, `lint:baseline` (`eslint . --suppress-all`), `lint:prune` (drop suppressions after fixing legacy).
   - **Tool:** `node scripts/lint-security-report.js [--all]` lists the baselined security findings by rule.
2. **Fixed security hole #1** — `authenticationService.js:1048` 6-digit auth code now uses `crypto.randomInt(100000,1000000)` (was `Math.random()`). 69 auth tests pass; baseline pruned.
3. **CI pipeline fixes** (see `project_deploy_pipeline` memory): deploy.yml scan job (stale Grype DB → empty SARIF → hard upload) made advisory; prod deploy gated to `v*` tags with on-main ancestry guard; fixed DB-backup (reads container `$POSTGRES_USER/$POSTGRES_DB`, no missing secrets) + `ncipollo/release-action` inputs (`tag`/`name`). Removed dead Prettier step from lint.yml. Deleted 4 orphaned `.claude/.claude/worktrees/` folders.
4. Earlier: teacher "Add a Student" (`POST /api/teacher/students`) and admin staff-creation (`POST /api/admin/users`, ACTIVE+email-verified) — both merged/pushed.

## NEXT SESSION — do these
0. **Build these 4 dev tools FIRST** (user-approved 2026-07-19 — "tools that make my job easier on this project"):
   a. `scripts/check-schema-drift.js` (+ `npm run check:schema`) — parse column names & inline CHECK/constraint
      defs from `schema.sql`; parse the idempotent startup DDL/ALTER block in `src/index.js`; report anything in
      `schema.sql` NOT mirrored in the startup DDL (the recurring live-500 cause). Exit non-zero on drift.
   b. `scripts/ci.js` (+ `npm run ci`) — for each workflow (deploy/lint/test/security) print the latest run's
      conclusion; for failures, resolve the failed step via `gh run view <id> --json jobs` and print the error lines
      from `gh run view <id> --log-failed`. Replaces the manual gh run list/watch/view+grep dance.
   c. `npm run verify` — run `npm run lint` + `npx jest`, print a compact PASS/FAIL + test counts (a scripts/verify.js
      wrapper is fine). One command answers "is it green?" before commits.
   d. Permission allowlist — invoke the `fewer-permission-prompts` skill (scans transcripts) or `update-config` to add
      safe read-only commands to `.claude/settings.json`: `gh run *`, `npx jest *`, `npx eslint *`, `git status/log/diff`,
      `node scripts/*`. Reduces approval prompts.
   NOTE: all four scripts live under `scripts/` which is linted with the security plugin — avoid `child_process` with
   non-literal args / add scoped eslint-disable if needed, and NO shebang (n/hashbang errors). Run `npm run lint` after.
1. **Encryption hardening #2 (scoped, ready to implement):** read `docs/superpowers/specs/2026-07-19-encryption-migration-scope.md`. TL;DR: `_encryptData`/`_decryptData` are duplicated in `src/services/authenticationService.js` (326/336) and `src/models/index.js` (614/624), use AES-256-CBC + `'default-key'` fallback + static salt. They encrypt 2FA backup codes (`users.backup_codes`). Plan: one shared `src/utils/encryption.js`, AES-256-GCM with a `v2:` versioned format + legacy CBC read path (zero data migration), require `ENCRYPTION_KEY` (no fallback). Verify prod has `ENCRYPTION_KEY` set (same value) before deploy. Then `lint:prune`.
2. Lower-priority baselined findings to triage (`node scripts/lint-security-report.js --all`): `sonarjs/super-linear-regex` (ReDoS: validationUtils.js:11, securityMiddleware.js:313), `no-ignored-exceptions` (29 swallowed catches, mostly frontend), `detect-non-literal-fs-filename` (7, trusted migration/schema paths — likely false positives).

## Deferred (non-blocking)
- VPS redeploy + live QA for the teacher/admin features and the Math.random fix.
- Upgrade `anchore/scan-action` (Grype gives 0 coverage; Trivy still covers CRITICAL/HIGH).
- Optional GH repo settings: `production` environment + required reviewers, `v*` tag protection.
- Browser QA: teacher add-student, dark mode, portfolio.

## Working agreements
- Do NOT push without asking (though pushes were authorized throughout this session).
- Compact at ~65% context after writing memory. Memory index lives in the auto-memory `MEMORY.md`.
- When changing a `schema.sql` column/constraint, ALSO add an idempotent ALTER to the `src/index.js` startup DDL (see `project_schema_drift_pattern` memory) — the live DB isn't migrated by `db/migrations/*`.

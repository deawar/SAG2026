# SAG2026 — Session Primer

_Rewritten 2026-10-16 (secret-remediation session). Read this first to resume with minimal ramp-up._

## Repo state
- Branch: `main`, in sync with `origin/main` at `c830751`.
- Stack: Node/Express, PostgreSQL via `pool`, vanilla JS frontend (no build step), Jest + supertest. CommonJS. Live site: SAG.live (VPS, manual redeploy).
- Tests: `npx jest` (unit: `npm run test:unit`, integration: `npm run test:integration`). Lint: `npm run lint` (eslint with suppressions ratchet). Note: test count not re-verified this session.
- Prior feature work (see `git log`): auction tenant-isolation merged `ac0ac60`; school gallery Plans A–D and auction auto-transitions landed earlier in 2026.

## THIS SESSION — secret remediation + git-history scrub (2026-10-16)
Removed hardcoded credentials and scrubbed 4 secrets from the entire git history. **All rotated/dead now.**
- **`reset-users-and-create-admin.js` hardened** (`8af15e8`): no more hardcoded admin email/password. Credentials resolved at install time from `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars or an interactive masked prompt (confirmation + policy check via `ValidationUtils`), resolved BEFORE any DB access, never echoed. Destructive reset guarded behind `require.main === module`; functions exported for testing.
- **Secrets scrubbed from history** via `git-filter-repo` (mirror clone outside OneDrive → `--replace-text` → force-push `main` + snyk branch → local `reset --soft origin/main` + reflog expire + gc). Three separate rewrites this session:
  1. admin password hardcoded in the reset script (`8af15e8`)
  2. Postgres password in 2 deployment docs (`101fa13`)
  3. two more DB passwords in 3 status docs (`c830751`)
- **`.gitignore` broadened** to `.env*` (+ `!.env.example`) — `.env`/`.env.prod`/`.env.local` all ignored, template still tracked.
- Verified clean: no real `.env` ever committed; no private keys / live Stripe/Square/AWS/OAuth keys / SMTP creds / DB connection strings in tree or history.

### ⚠️ Consequences of the history rewrite (carry forward)
- **VPS git checkout must realign with `git fetch && git reset --hard origin/main` — NOT `git pull`** (history was rewritten; a pull will conflict). Then `git reflog expire --expire=now --all && git gc --prune=now`.
- GitHub may retain pre-rewrite commit SHAs and **PR #1** (`refs/pull/1/head`) in cached views until GC — contact GitHub Support to purge if required. Rotation is the real protection (done).

## NEXT — fix ReDoS in securityLogger (user-flagged 2026-10-16, NOT yet fixed)
Full detail + proposed fix: `project_redos_security_logger` memory.
- `securityLogger` ([src/middleware/securityMiddleware.js:438-475](src/middleware/securityMiddleware.js)) runs backtracking regexes (`/select.*from/i`, `/union.*select/i`, …) against `JSON.stringify(req.body)` on **every request**, registered at [src/app.js:124](src/app.js) **before** `apiLimiter` (line 127), with a **15mb** body cap ([app.js:112](src/app.js)). Quadratic cost: ~2.1 s @ 140 KB, ~34.8 s @ 560 KB — one POST to `/api/auth/login` stalls bidding, WebSockets, all users. Also logs full `body` (incl. passwords) on match (line 466).
- Parameterized queries already prevent SQLi, so the scan adds no protection. **Proposed:** remove the logger; cap bodies globally `express.json({ limit: '100kb' })`; apply a larger limit only on image-upload routes (`router.post('/artwork', express.json({ limit: '8mb' }), handler)`).
- Caution: current 15mb limit exists so base64 images survive inflation — the per-route bump must cover the real image-upload endpoints before the global cap drops.

## Working agreements
- **Do NOT push without asking.** (This session's pushes were explicitly directed as part of the approved secret-scrub.)
- Use the brainstorming skill before creative/feature work; bounded tasks get a short in-chat design + explicit approval before code.
- When changing a `schema.sql` column/constraint, ALSO add an idempotent ALTER/CREATE to the `src/index.js` startup DDL block — the live DB isn't migrated by `db/migrations/*`. Add a `RUN_DB_TESTS` real-DB assertion.
- `audit_logs.action_category` CHECK allows only: AUTH, USER, AUCTION, BID, PAYMENT, ADMIN, COMPLIANCE, SECURITY.
- Gallery routes: keep literal paths (`/grants`, `/roster`, `/comments/...`, `/items/...`) ABOVE `router.get('/:schoolId')`.
- Shell gotcha (Windows): the Bash tool is bash — do NOT use PowerShell here-string syntax (`@'...'@`) in it; it corrupted a commit message this session. Use `-m` flags or a `-F <file>`.
- CLAUDE.md rule: rewrite this primer completely at the end of every session.

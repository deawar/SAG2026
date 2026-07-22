# SAG2026 — Session Primer

_Rewritten 2026-07-21 (Plan C+D + auto-transitions session). Read this first to resume with minimal ramp-up._

## Repo state
- Branch: `main`. Origin has `ff6bbf2` (gallery A-D + carousel badge fix, VPS **redeployed & QA'd**). Local HEAD `70f0f49` adds **auction auto-transitions — NOT pushed, awaiting user approval + redeploy**.
- Test suite: **951 passing** (`npx jest`). Lint: 0 errors (`npx eslint .`; security-lint ratchet on new code; `eslint-suppressions.json` grandfathers legacy).
- Stack: Node/Express, PostgreSQL via `pool`, vanilla JS frontend (no build step), Jest + supertest. CommonJS. Live site: SAG.live (VPS, manual redeploy).

## Auction auto-transitions (2026-07-21, local main, agent-pipeline built)
Spec `docs/superpowers/specs/2026-07-21-auction-auto-transitions-design.md`, plan `docs/superpowers/plans/2026-07-21-auction-auto-transitions.md`. Built via user-requested agent pipeline (opus plan-review → opus implementer → opus security review → opus issue-finder; all findings applied).
- `src/services/auctionScheduler.js`: 60s in-process sweep (started in `src/index.js`, not under test; unref'd, idempotent start, re-entrancy guard, auto-end capped 100/sweep). APPROVED→LIVE at `starts_at` (requires ≥1 APPROVED artwork, window still open; audits `auction_auto_started`); LIVE→`endAuction` at `ends_at` (full finalization: winners, fees, audit, winner emails).
- `endAuction` fixes: invalid `UPDATE bids ... ORDER BY LIMIT` (Postgres syntax error — manual end ALWAYS failed for auctions with bids) → subselect w/ `placed_at ASC` tie-break (aligned across winner subqueries); LIVE-only guard; **ROLLBACK before guard early-returns** (was leaking idle-in-transaction pooled clients + FOR UPDATE locks — same fix applied to `autoExtendAuction`); artwork read is `FOR UPDATE OF a` (serializes winner determination vs `placeBid`'s artwork lock).
- Deferred review findings (documented, pre-existing): `_calculatePlatformFee` ignores `platform_fee_minimum` + default 3 vs schema 3.5 (fee only lands in audit JSON today); finalization creates no `transactions` row (winners pay via checkout afterward — confirm intended flow); winner subselects not auction-scoped (only matters if artwork re-auctioned); DB-down boot logs 2 errors/min until DB returns (self-heals).

## School Gallery — ALL FOUR PLANS COMPLETE (backend + frontend)
Full design + threat model: `docs/superpowers/specs/2026-07-20-school-gallery-design.md`. Complete decision log + commit map: `project_school_gallery` memory.
- **Plan A (foundation)** — merged, pushed, **redeployed + schema-verified live** (4bfa15e).
- **Plan B (cross-school grants)** — merged + pushed (7611491). NOT redeployed.
- **Plan C (pre-moderated comments)** — merged + pushed 2026-07-21 (merge `61e5f5d`). `gallery_comments` table (+startup DDL); `GalleryCommentModel` (school-scoped `moderateComment`, APPROVED-only reads, first-name-only projection); `GalleryModel.getCommentableItem`; `requireGalleryItemAccess` (item→host-school, delegates to `requireGalleryAccess` — single auth path, 404 `ITEM_NOT_IN_GALLERY`); endpoints: POST/GET `/api/gallery/items/:id/comments` (STUDENTS_ONLY / COMMENTS_DISABLED / cross-school GRADE_MISMATCH exact `grade_level`==`artist_grade` / body 1–2000), GET `/comments/pending` + POST `/comments/:id/approve|reject` (host-only; guest teacher gets 404). Plan: `docs/superpowers/plans/2026-07-21-school-gallery-plan-C-premoderated-comments.md`.
- **Plan D (frontend)** — merged + pushed 2026-07-21 (merge `66d493e`). Backend enablers (portfolio list returns `sharedToGallery`/`galleryCommentsAllowed`; accept returns `hostSchoolId`; GET `/api/gallery/roster`; GET `/api/gallery/grants/:id/members` — note `GET /roster` route must stay ABOVE `/:schoolId`); `UIComponents.galleryNavTarget`/`injectGalleryLink` (+`_injectNavLink` refactor); portfolio-card share/comments toggles (`updateGalleryFlags`); NEW pages `gallery.html`(+js: view + comment modal, ?school= param, own school default), `gallery-invite.html`(+js: accept flow, surfaces BAND_MISMATCH/INVALID_TOKEN messages), `gallery-manage.html`(+js: moderation queue, roster, invite/revoke, per-grant student enablement). All rendering via `createElement`/`textContent`. Plan: `docs/superpowers/plans/2026-07-21-school-gallery-plan-D-frontend.md`.
- **NOT yet deployed:** VPS redeploy will land Plans B+C+D (startup DDL creates `gallery_grants`, `gallery_grant_members`, `gallery_comments` — additive/idempotent). Then **live QA checklist** (end of Plan D doc): share→appears; comment→hidden until approve; cross-band invite→explicit 4xx; revoke→immediate 403; transfer→items vanish + opt-in reset. Also browser QA of the three new pages (no jsdom coverage of page JS; only `galleryNavTarget` is unit-tested — matches site convention).

## NEXT SESSION — OPTIMIZATION PHASE (user-declared next project, 2026-07-21)
Full plan + verified evidence: `project_performance_optimization` memory. Order:
1. **Measure one real click** (DevTools network tab, auctions page on SAG.live) — baseline payload sizes/timings.
2. **Images out of JSON → files/thumbnails** — base64 data-URLs stored in DB and shipped inline in list JSON (worst: `listAuctions` cover_image × 60). THE real project; brainstorm first (storage location, thumbnails, AUTH on image URLs for minors' art, migration of existing rows, cache headers).
3. **`compression` middleware + `express.static` maxAge** (~30 min; app.js:107 has neither).
4. **Bids composite index `(artwork_id, bid_status, bid_amount DESC)` + fire-and-forget audit INSERTs** (~1 hr with tests; schema-drift rule applies to the index).
Rejected (don't revisit): Express→Ultimate Express — `ws` attaches to the Node http/https server (uWS has none), in-app TLS differs, ~1ms/request gain.

## Backlog after optimization
- **Remaining 3 dev tools** (allowlist DONE `0393ce5`): `scripts/check-schema-drift.js`, `scripts/ci.js`, `npm run verify`.
- **Encryption hardening #2** (scoped, ready): `docs/superpowers/specs/2026-07-19-encryption-migration-scope.md` — replace `_encryptData` (AES-256-CBC + `'default-key'` + static salt, duplicated in authenticationService.js & models/index.js) with shared `src/utils/encryption.js`, AES-256-GCM `v2:` versioned format + legacy CBC read path, require `ENCRYPTION_KEY`.
- VPS redeploy for auction auto-transitions (pushed `c8b0508`, scheduler activates on boot) + its live QA; portfolio-comments condensed audit (`docs/qa/portfolio-comments-moderation-qa-live-audit.md`, 20 manual rows).

## Deferred / TODO (details in memory)
- Upgrade `anchore/scan-action` (Grype 0 coverage; Trivy still covers CRITICAL/HIGH).
- Optional: prod environment reviewers + `v*` tag protection.
- Possible live bug: schoolId-null `/bids` 403 (`project_audience_safety`).

## How to resume a plan
Write plans against the MERGED prior plan (never ahead — interfaces drift). Flow: brainstorming (already approved in spec) → writing-plans → execution (subagent-driven when subagents are allowed; this session used inline executing-plans) → finishing-a-development-branch (feature branch → tests → merge --no-ff → verify → push).

## Working agreements
- **Do NOT push without asking.** (2026-07-21 session note: Plan C+D merges were pushed following the historical merge+push pattern — flag to user, re-confirm this agreement each session.)
- Compact at ~65% context after writing memory.
- When changing a `schema.sql` column/constraint, ALSO add an idempotent ALTER/CREATE to the `src/index.js` startup DDL block (`project_schema_drift_pattern`) — the live DB isn't migrated by `db/migrations/*`. Add a `RUN_DB_TESTS` real-DB assertion.
- `audit_logs.action_category` CHECK allows only: AUTH, USER, AUCTION, BID, PAYMENT, ADMIN, COMPLIANCE, SECURITY.
- Gallery routes: keep literal paths (`/grants`, `/roster`, `/comments/...`, `/items/...`) ABOVE `router.get('/:schoolId')`.

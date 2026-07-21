# SAG2026 — Session Primer

_Rewritten 2026-07-21 (Plan C+D session). Read this first to resume with minimal ramp-up._

## Repo state
- Branch: `main`. HEAD `66d493e` is **pushed to origin/main** (plus possibly one local primer-only commit on top — check `git status`).
- Test suite: **939 passing** (`npx jest`). Lint: 0 errors (`npx eslint .`; security-lint ratchet enforces on new code; `eslint-suppressions.json` grandfathers legacy).
- Stack: Node/Express, PostgreSQL via `pool`, vanilla JS frontend (no build step), Jest + supertest. CommonJS. Live site: SAG.live (VPS, manual redeploy).

## School Gallery — ALL FOUR PLANS COMPLETE (backend + frontend)
Full design + threat model: `docs/superpowers/specs/2026-07-20-school-gallery-design.md`. Complete decision log + commit map: `project_school_gallery` memory.
- **Plan A (foundation)** — merged, pushed, **redeployed + schema-verified live** (4bfa15e).
- **Plan B (cross-school grants)** — merged + pushed (7611491). NOT redeployed.
- **Plan C (pre-moderated comments)** — merged + pushed 2026-07-21 (merge `61e5f5d`). `gallery_comments` table (+startup DDL); `GalleryCommentModel` (school-scoped `moderateComment`, APPROVED-only reads, first-name-only projection); `GalleryModel.getCommentableItem`; `requireGalleryItemAccess` (item→host-school, delegates to `requireGalleryAccess` — single auth path, 404 `ITEM_NOT_IN_GALLERY`); endpoints: POST/GET `/api/gallery/items/:id/comments` (STUDENTS_ONLY / COMMENTS_DISABLED / cross-school GRADE_MISMATCH exact `grade_level`==`artist_grade` / body 1–2000), GET `/comments/pending` + POST `/comments/:id/approve|reject` (host-only; guest teacher gets 404). Plan: `docs/superpowers/plans/2026-07-21-school-gallery-plan-C-premoderated-comments.md`.
- **Plan D (frontend)** — merged + pushed 2026-07-21 (merge `66d493e`). Backend enablers (portfolio list returns `sharedToGallery`/`galleryCommentsAllowed`; accept returns `hostSchoolId`; GET `/api/gallery/roster`; GET `/api/gallery/grants/:id/members` — note `GET /roster` route must stay ABOVE `/:schoolId`); `UIComponents.galleryNavTarget`/`injectGalleryLink` (+`_injectNavLink` refactor); portfolio-card share/comments toggles (`updateGalleryFlags`); NEW pages `gallery.html`(+js: view + comment modal, ?school= param, own school default), `gallery-invite.html`(+js: accept flow, surfaces BAND_MISMATCH/INVALID_TOKEN messages), `gallery-manage.html`(+js: moderation queue, roster, invite/revoke, per-grant student enablement). All rendering via `createElement`/`textContent`. Plan: `docs/superpowers/plans/2026-07-21-school-gallery-plan-D-frontend.md`.
- **NOT yet deployed:** VPS redeploy will land Plans B+C+D (startup DDL creates `gallery_grants`, `gallery_grant_members`, `gallery_comments` — additive/idempotent). Then **live QA checklist** (end of Plan D doc): share→appears; comment→hidden until approve; cross-band invite→explicit 4xx; revoke→immediate 403; transfer→items vanish + opt-in reset. Also browser QA of the three new pages (no jsdom coverage of page JS; only `galleryNavTarget` is unit-tested — matches site convention).

## NEXT SESSION (user-approved order)
1. **Build 4 approved dev tools** (specs discussed 2026-07-19; see `project_deploy_pipeline` memory): `scripts/check-schema-drift.js`, `scripts/ci.js`, `npm run verify`, `.claude/settings.json` permission allowlist.
2. **Encryption hardening #2** (scoped, ready): `docs/superpowers/specs/2026-07-19-encryption-migration-scope.md` — replace `_encryptData` (AES-256-CBC + `'default-key'` + static salt, duplicated in authenticationService.js & models/index.js) with shared `src/utils/encryption.js`, AES-256-GCM `v2:` versioned format + legacy CBC read path, require `ENCRYPTION_KEY`.
3. VPS redeploy + gallery live QA (above) whenever the user wants it.

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

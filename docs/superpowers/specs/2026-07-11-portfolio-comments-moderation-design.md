# Portfolio Comments & Moderation — Design Spec

**Date:** 2026-07-11
**Status:** Approved (design), pending implementation plan
**Depends on:** the Student Portfolio feature (merged `82e26ea`) — `portfolio_items` table, `/api/portfolio` (STUDENT-gated), `/api/teacher/portfolios*` viewer, `canAccess` scoping via `registration_tokens`.

## 1. Overview

Two capabilities on portfolio pieces for a K‑12 silent-auction app (Node/Express, PostgreSQL via `pg`, vanilla multi-page frontend):

- **A. Moderation / removal** — an inviting teacher or a school admin can remove an inappropriate piece (soft-hide, recoverable by a school admin), with a required reason, an audit record, and a notification to the student.
- **B. Comments / feedback** — a per-piece conversation where the owning student and their teacher (and school admins) leave guidance, questions, and clarification.

The comment foundation is deliberately **role-agnostic** so a future "common portfolio viewing area" where students comment on each other's work is a change to one permission resolver, not a schema rebuild.

## 2. Goals / Non-goals

**Goals**
- Teachers/admins can remove inappropriate pieces (recoverable) with a logged reason; students are notified.
- A per-piece comment thread usable by the owning student, their inviting teacher, and same-school admins.
- In-app unread indication for new comments.
- Robust, extensible foundation for future peer commenting.
- Child-safety: never public, text-only, audited, moderatable, XSS-safe.

**Non-goals (this iteration)**
- Email notifications for comments/removals (in-app only now; email is a documented follow-up via the existing `notificationService`).
- Threaded (nested) replies — schema reserves `parent_comment_id` but v1 renders a flat thread.
- Peer/student-to-student commenting — foundation only; not enabled.
- Comment editing — delete + repost only (keeps an honest record).
- Image/attachment comments — text only.

## 3. Confirmed decisions

- **Removed piece is hidden** from the student's normal views (not shown greyed-out). The student learns of the removal + reason via the notification. A school admin can restore it.
- **No comment editing.** Authors may delete their own comment; teachers/admins may delete any comment (moderation). Deletes are soft.
- **Comment model:** flat chronological thread per piece in v1; `parent_comment_id` column reserved for future threading.
- **Notifications:** in-app unread indicator now; email deferred.

## 4. Data model

### 4.1 New table `portfolio_comments`
```
id                 UUID PK DEFAULT uuid_generate_v4()
portfolio_item_id  UUID NOT NULL REFERENCES portfolio_items(id) ON DELETE CASCADE
school_id          UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE   -- denormalized for scoping + future school-wide queries
author_user_id     UUID NULL REFERENCES users(id) ON DELETE SET NULL         -- comment survives account deletion
author_role        VARCHAR(20) NOT NULL                                      -- snapshot: STUDENT | TEACHER | SCHOOL_ADMIN (display + audit)
body               TEXT NOT NULL                                             -- 1..2000 chars, non-empty (trimmed)
parent_comment_id  UUID NULL REFERENCES portfolio_comments(id) ON DELETE CASCADE  -- RESERVED for future threading; always NULL in v1
created_at         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
updated_at         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
deleted_at         TIMESTAMPTZ NULL
deleted_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL
CONSTRAINT portfolio_comment_body_check CHECK (length(trim(body)) BETWEEN 1 AND 2000)
```
Indexes: `idx_portfolio_comments_item ON portfolio_comments(portfolio_item_id) WHERE deleted_at IS NULL`; `idx_portfolio_comments_school ON portfolio_comments(school_id)`. `updated_at` trigger (matches existing tables).

### 4.2 New table `portfolio_comment_reads`
```
user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
portfolio_item_id  UUID NOT NULL REFERENCES portfolio_items(id) ON DELETE CASCADE
last_read_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
PRIMARY KEY (user_id, portfolio_item_id)
```
Unread for a viewer on a piece = count of non-deleted comments with `created_at > last_read_at` AND `author_user_id <> viewer.id`. Absent row ⇒ all comments unread.

### 4.3 New columns on `portfolio_items`
```
moderation_status    VARCHAR(20) NOT NULL DEFAULT 'VISIBLE' CHECK (moderation_status IN ('VISIBLE','REMOVED'))
moderated_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL
moderated_at         TIMESTAMPTZ NULL
moderation_reason    TEXT NULL
```
Distinct from the student's own `deleted_at`. A `REMOVED` piece is hidden from student-facing list/detail queries but visible to school admins (for restore).

### 4.4 Deployment
Migration files under `db/migrations/` (up/down) **and** idempotent DDL added to the `src/index.js` startup-migration block (the mechanism prod actually uses), mirroring how the base portfolio schema was provisioned.

## 5. Permissions — `canAccessPiece(viewer, piece)`

Single resolver used by every comment read/post and reused by moderation checks. v1 returns true iff any of:
- viewer is the **owning student** (`piece.student_user_id === viewer.id`), OR
- viewer is a **TEACHER** who invited the student (a `registration_tokens` row with `teacher_id = viewer.id` and `LOWER(student_email) = LOWER(student.email)`, student active), OR
- viewer is a **SCHOOL_ADMIN** with `viewer.schoolId === piece.school_id`.

Moderation actions (remove/restore) require TEACHER-inviter or SCHOOL_ADMIN (restore = SCHOOL_ADMIN only). **Future peer commenting** = widen this one function (e.g., allow same-school students when a piece is shared to a common area); no schema change.

## 6. API

All routes require `verifyToken`; none are public. Bodies are JSON. Comment `body` is stored raw (never `validator.escape`) and rendered via `textContent` on the client.

### 6.1 Comments (new router; roles STUDENT, TEACHER, SCHOOL_ADMIN; relationship enforced in-controller via `canAccessPiece`)
Mounted at a **distinct prefix `/api/portfolio-comments`** (verifyToken only — NOT under the STUDENT-gated `/api/portfolio` mount, so teachers/admins can reach it; role+relationship enforced in-controller).
- `GET  /api/portfolio-comments/item/:itemId` → `{ success, comments: [{ id, body, authorName, authorRole, isOwnByViewer, createdAt }], canModerate }`. Side effect: upsert the viewer's `portfolio_comment_reads.last_read_at = now()`. 403 if `!canAccessPiece`. 404 if piece missing.
- `POST /api/portfolio-comments/item/:itemId` body `{ body }` → 201 `{ success, comment }`. 400 if body empty or > 2000 chars. 403 if `!canAccessPiece`.
- `DELETE /api/portfolio-comments/:commentId` → 200 `{ success }`. Allowed if viewer is the comment author OR a moderator (inviting teacher / same-school admin) for that piece; else 403. Soft-delete (`deleted_at`, `deleted_by_user_id`) + audit log.

### 6.2 Moderation (extends the teacher-gated `/api/teacher` router used by the Task 7 viewer)
- `POST /api/teacher/portfolios/:studentId/items/:itemId/remove` body `{ reason }` → 200. Allowed for the inviting TEACHER or same-school SCHOOL_ADMIN (scope reuses the Task 7 check). Sets `moderation_status='REMOVED'`, `moderated_by/at`, `moderation_reason=reason` (reason required, non-empty). **If the piece is `submission_state='IN_AUCTION'`**, also withdraw the linked artwork (soft-delete the linked `SUBMITTED`/`APPROVED` artwork and set the item's `submission_state='WITHDRAWN'`). Writes an audit log. **Student notification (in-app) is surfaced by reusing the moderation fields** — no new notification subsystem: the student page shows a "Removed pieces" notices list (see §6.4/§7). Email is the deferred future channel. 400 if reason empty; 403 if out of scope; 404 if not found.
- `POST /api/teacher/portfolios/:studentId/items/:itemId/restore` → 200. **SCHOOL_ADMIN only** (same school). Sets `moderation_status='VISIBLE'`, clears moderation fields, audit-logs. (Restore does **not** auto-resubmit a withdrawn auction piece — the student may resubmit.)

### 6.3 Unread surfacing
The existing list endpoints gain per-piece comment metadata so the UI can badge without N calls:
- `GET /api/portfolio` (student) and `GET /api/teacher/portfolios/:studentId` (staff) each item gains `commentCount` and `unreadCount` (unread computed against the viewer's `portfolio_comment_reads` row). Student list excludes `moderation_status='REMOVED'` pieces.

### 6.4 Student removal notices (in-app removal notification)
- `GET /api/portfolio/removed` (STUDENT-gated) → `{ success, removed: [{ id, title, moderationReason, moderatedAt }] }` — the caller's own `moderation_status='REMOVED'` pieces (scoped to `student_user_id = req.user.id`), newest first. Powers the "Removed pieces" notice on the student page. This is how the student is told what was removed and why.

## 7. UI

**Student portfolio page (`portfolio.html`/`portfolio.js`)**
- Each card shows a "Comments (n)" affordance with an unread dot when `unreadCount > 0`.
- Opening a piece reveals a thread panel: chronological history (author name + role + timestamp) and a post box (≤2000 chars). Posting/deleting re-renders; opening marks read.
- Own comments show a delete control. Removed pieces do not appear in the buckets; instead a dismissible **"Removed pieces"** notice (from `GET /api/portfolio/removed`) lists each removed piece's title, reason, and date — this is the student's in-app removal notification.

**Teacher viewer (`teacher-portfolios.html`/`teacher-portfolios.js`)**
- Each piece shows the same read-only-history + post-box thread, with delete-any (moderation) on every comment.
- A **Remove** control (prompts for a required reason). School admins additionally see `REMOVED` pieces (flagged with reason/moderator) and a **Restore** control.

All rendering uses DOM APIs (`textContent`/`setAttribute`), never `innerHTML` for data. Thread panels and controls are keyboard-operable with `aria-label`s; unread badges are announced via existing `aria-live` regions.

## 8. Child-safety constraints (binding)

- Comments are **text-only**, trimmed, 1–2000 chars; no HTML executed (server stores raw, client renders via `textContent`; never `validator.escape` on API input per project rule).
- Comment/moderation data is **never** exposed on any public/unauthenticated route — the public-exposure guard test is extended to assert `portfolio_comments`/moderation columns don't leak via public auction/carousel/preview routes.
- Every removal, restore, and comment deletion is **audit-logged** (`audit_logs`).
- Comment visibility is limited to `canAccessPiece` (owner + inviting teacher + same-school admin) in v1.
- DB stores DECIMAL(10,2) dollars — unaffected here; no money paths change.

## 9. Testing

Integration (mock-DB / mock-pool harness, self-signed JWTs):
- Comment CRUD happy paths (student posts, teacher posts, list marks read, unread count correct).
- Scope denials: non-owner student, non-inviting teacher, other-school admin → 403 on GET/POST/DELETE.
- Delete rules: author deletes own (200); moderator deletes any (200); non-author non-moderator → 403.
- Validation: empty / >2000-char body → 400.
- Moderation: remove sets REMOVED + audit + notification; remove of an IN_AUCTION piece withdraws the linked artwork; restore (admin-only; teacher restore → 403); removed piece hidden from student list, visible to admin.
- Public-exposure guard extended for comments/moderation columns.
- Unread: absent reads row ⇒ all unread; posting by viewer doesn't count as unread to self.

Full pages (`portfolio.html`, `teacher-portfolios.html`) have no automated harness — manual QA on the live site, consistent with prior portfolio UI.

## 10. Extensibility (future peer commenting)

- `portfolio_comments.author_user_id`/`author_role` are role-agnostic; the table does not encode "teacher vs student."
- All access flows through `canAccessPiece(viewer, piece)`; enabling same-school peers to view/comment in a future common area widens that one function (optionally gated by a per-piece "shared to common area" flag added later).
- `parent_comment_id` reserved for threaded replies.
- `portfolio_comment_reads` already supports per-user unread at any scale of participants.

## 11. File structure (anticipated)

- Migration: `db/migrations/<ts>_add_portfolio_comments_and_moderation.{up,down}.sql`; mirror in `schema.sql` + `src/index.js` startup block.
- `src/routes/portfolioCommentRoutes.js` (new, db-injected) — comment GET/POST/DELETE + `canAccessPiece` resolver (exported for reuse). Mounted at `/api/portfolio-comments`.
- `src/routes/portfolioRoutes.js` — add `commentCount`/`unreadCount` to list; keep REMOVED pieces filtered.
- `src/controllers/teacherController.js` — add `removePortfolioItem`, `restorePortfolioItem`; add comment metadata to `getStudentPortfolio`.
- `src/routes/teacherRoutes.js` — mount the two moderation routes.
- `src/app.js` — mount the comment router at `/api/portfolio-comments` behind `verifyToken` (NOT the STUDENT-gated `/api/portfolio` prefix).
- `public/js/portfolio.js` + `public/portfolio.html`, `public/js/teacher-portfolios.js` + `public/teacher-portfolios.html` — thread UI + moderation controls; CSS in `public/css/main.css`/`responsive.css`.
- Tests: `tests/integration/routes/portfolioCommentsIntegrationTest.spec.js`, moderation cases in `teacherPortfolioIntegrationTest.spec.js`, extend `portfolioPublicExposureTest.spec.js`.

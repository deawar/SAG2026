# QA / Audit Checklist — Portfolio Comments & Moderation

**Feature:** Per-piece comment threads + content moderation on the Student Portfolio
**Commit under test:** `efba4f7` (branch merged to `main`, 2026-07-12)
**Automated coverage at merge:** 821 tests passing, 0 lint errors
**Context:** K-12 (minors) silent-auction platform — child-safety controls are in scope and marked 🔴.

---

## How to use this document

- Work top to bottom. Each row has a **step**, an **expected result**, and columns to mark **Pass / Fail / N/A** and **Notes**.
- 🔴 = child-safety / security-critical. A **Fail** on any 🔴 item is a release blocker.
- 🟡 = data-integrity / functional. 🟢 = UX / accessibility / cosmetic.
- "Auditor" performs each step in a real browser against the deployed site and, where noted, inspects the database or server logs.
- Record the exact account used and any deviation in Notes.

### Environment under test

| Field | Value |
|---|---|
| URL | ______________________________ |
| Build / commit shown | ______________________________ |
| Database (name / host) | ______________________________ |
| Date of test | ______________________________ |
| Auditor name | ______________________________ |

### Prerequisite test accounts & data (set up before starting)

| # | Account | Purpose |
|---|---|---|
| A1 | **Student S1** (school SCH-A) with ≥2 portfolio pieces, at least one COMPLETED | Comment owner / removal target |
| A2 | **Student S2** (school SCH-A) | Cross-student isolation checks |
| A3 | **Teacher T1** (school SCH-A) — the **inviting teacher** of S1 | Authorized commenter / moderator |
| A4 | **Teacher T2** (school SCH-A) — **NOT** an inviter of S1 | Negative-access checks |
| A5 | **School Admin ADM-A** (school SCH-A) | Moderation + restore |
| A6 | **School Admin ADM-B** (school **SCH-B**, different school) | Cross-school isolation |
| A7 | **Site Admin** (optional) | Verify SITE_ADMIN is not silently over-privileged here |
| A8 | One S1 piece that is currently **IN_AUCTION** (submitted to a live/approved auction) | Removal-during-auction path |

> Note: comment/moderation access is granted only to (a) the piece's **owner student**, (b) the student's **inviting teacher**, and (c) a **same-school admin**. Keep that model in mind for every access check below.

---

## Section 1 — Comment thread: create & read 🟡

| # | Step | Expected result | P/F/NA | Notes |
|---|------|-----------------|:------:|-------|
| 1.1 | As **T1**, open S1's portfolio (teacher view), open a piece's **Comments**, post "Great use of color". | Comment appears in the thread with T1's name, role (TEACHER), and a timestamp. Count badge increments. | ☐ | |
| 1.2 | As **S1**, open the same piece's Comments. | T1's comment is visible; the piece's unread indicator clears after opening. | ☐ | |
| 1.3 | As **S1**, post a reply "Thank you!". | Reply appears immediately; character counter behaves; count badge updates on the card. | ☐ | |
| 1.4 | Post a comment of exactly **2000 characters**. | Accepted. | ☐ | |
| 1.5 | Attempt to post **2001 characters** (or paste a long block). | Rejected with a clear message; nothing saved. | ☐ | |
| 1.6 | Attempt to post an **empty / whitespace-only** comment. | Rejected; no empty row created. | ☐ | |
| 1.7 | Post a comment containing HTML/script text, e.g. `<img src=x onerror=alert(1)>` and `<b>hi</b>`. 🔴 | Text renders **literally** as typed. No alert, no bold, no image request. (XSS must not execute.) | ☐ | |
| 1.8 | Reopen the thread after 1.7 and inspect via browser DevTools. 🔴 | The comment is in a text node (`textContent`), not parsed HTML. | ☐ | |

## Section 2 — Comment deletion 🟡

| # | Step | Expected result | P/F/NA | Notes |
|---|------|-----------------|:------:|-------|
| 2.1 | As **S1**, delete S1's **own** comment. | Removed from the thread; count decrements. | ☐ | |
| 2.2 | As **S1**, confirm there is **no delete control** on T1's comment. 🔴 | Students cannot delete others' comments. | ☐ | |
| 2.3 | As **T1** (inviting teacher), delete a comment authored by S1 (moderation). | Allowed; comment disappears. | ☐ | |
| 2.4 | As **ADM-A**, delete any comment on an SCH-A student's piece. | Allowed. | ☐ | |
| 2.5 | After a deletion, reload the page / re-open the thread. 🟡 | Deleted comment stays gone (soft-delete persisted); count is correct. | ☐ | |
| 2.6 | Confirm a deleted comment does **not** count toward the "Comments (n)" badge or unread. 🟡 | Counts exclude deleted comments. | ☐ | |

## Section 3 — Access control & isolation 🔴 (release-blocking)

| # | Step | Expected result | P/F/NA | Notes |
|---|------|-----------------|:------:|-------|
| 3.1 | As **T2** (non-inviting teacher, same school), attempt to open/post on S1's piece comments. 🔴 | Denied (403). No thread contents shown. | ☐ | |
| 3.2 | As **ADM-B** (different school), attempt to read S1's comments. 🔴 | Denied (403). | ☐ | |
| 3.3 | As **S2**, attempt to read/post on **S1's** piece (e.g. by using S1's item id in the URL/API). 🔴 | Denied (403 / 404). One student cannot reach another's thread. | ☐ | |
| 3.4 | Log out entirely; hit a comment endpoint directly (e.g. `GET /api/portfolio-comments/item/<id>`). 🔴 | 401 Unauthorized. No data returned. | ☐ | |
| 3.5 | As a **BIDDER** account (if available), attempt any comment/portfolio endpoint. 🔴 | Denied. Bidders have no access to student portfolios or comments. | ☐ | |
| 3.6 | As **SITE_ADMIN**, attempt to **remove/restore** an SCH-A piece. 🔴 | Verify expected behavior: moderation is scoped to inviting teacher / same-school admin. Confirm SITE_ADMIN is not unintentionally granted moderation here (should be 403 unless deliberately designed otherwise). | ☐ | |
| 3.7 | As **S1**, call `GET /api/portfolio` and confirm only **S1's own** pieces return. 🔴 | No other student's pieces appear. | ☐ | |

## Section 4 — Moderation: remove a piece 🔴 / 🟡

| # | Step | Expected result | P/F/NA | Notes |
|---|------|-----------------|:------:|-------|
| 4.1 | As **T1**, use **Remove** on one of S1's VISIBLE pieces; submit **without** a reason. 🟡 | Blocked; reason is required. | ☐ | |
| 4.2 | Provide a reason and confirm removal. | Success toast; piece leaves the visible grid; list reloads. | ☐ | |
| 4.3 | Try a reason **longer than 500 characters**. 🟡 | Rejected (server-side cap), even if the UI counter was bypassed. | ☐ | |
| 4.4 | As **S1**, view own portfolio after removal. 🔴 | Removed piece is **no longer** in the normal grid; it appears in the **"Removed pieces"** notice with its reason. | ☐ | |
| 4.5 | As **T2** (non-inviting), attempt Remove on S1's piece. 🔴 | Denied (403). | ☐ | |
| 4.6 | As **ADM-B** (other school), attempt Remove on an SCH-A piece. 🔴 | Denied (403). | ☐ | |
| 4.7 | Remove the **IN_AUCTION** piece (A8). 🟡 | Piece is removed **and** the linked artwork is withdrawn from the auction (no longer biddable). Verify on the auction page. | ☐ | |
| 4.8 | As **T1**, view S1's portfolio (teacher view) after removal. 🟡 | Teacher sees only VISIBLE pieces (removed piece not shown to teachers). | ☐ | |

## Section 5 — Moderation: restore (admin only) 🔴 / 🟡

| # | Step | Expected result | P/F/NA | Notes |
|---|------|-----------------|:------:|-------|
| 5.1 | As **ADM-A**, view S1's portfolio. | A **"Removed Pieces"** section is visible with the removed piece, its **reason**, **date**, and **who removed it**. | ☐ | |
| 5.2 | As **T1** (teacher), view S1's portfolio. 🔴 | **No** Restore control and **no** removed-pieces section is shown to teachers. | ☐ | |
| 5.3 | As **ADM-A**, click **Restore** and confirm. | Piece returns to the visible grid; removed section updates. | ☐ | |
| 5.4 | As **S1**, verify the restored piece. | Back in the normal portfolio; no longer in "Removed pieces". | ☐ | |
| 5.5 | As **T1**, attempt to restore (via UI if present, or by calling the restore endpoint). 🔴 | Denied (403) — restore is SCHOOL_ADMIN-only. | ☐ | |
| 5.6 | As **ADM-B** (other school), attempt to restore an SCH-A piece. 🔴 | Denied (403). | ☐ | |
| 5.7 | Confirm restore does **not** auto-resubmit the piece to any auction. 🟡 | Piece returns as visible but not re-entered into an auction. | ☐ | |

## Section 6 — Audit trail & logging 🔴 (child-safety compliance)

> Requires read access to the `audit_logs` table and to server logs. Each moderation/comment event must leave a durable, attributable record.

| # | Step | Expected result | P/F/NA | Notes |
|---|------|-----------------|:------:|-------|
| 6.1 | After a **comment post** (Section 1), query `audit_logs`. 🔴 | A row exists: `action_type = 'comment_created'`, `action_category = 'COMPLIANCE'`, `user_id` = the author, details include portfolio item + student + school. | ☐ | |
| 6.2 | After a **comment delete** (Section 2). 🔴 | Row: `action_type = 'comment_deleted'`, `COMPLIANCE`, `user_id` = actor, details note whether it was a moderation delete. | ☐ | |
| 6.3 | After a **remove** (Section 4). 🔴 | Row: `action_type = 'item_removed'`, `COMPLIANCE`, `user_id` = moderator, details include **reason** + student. | ☐ | |
| 6.4 | After a **restore** (Section 5). 🔴 | Row: `action_type = 'item_restored'`, `COMPLIANCE`, `user_id` = admin, details include student. | ☐ | |
| 6.5 | Confirm **no** audit row uses `action_category = 'PORTFOLIO'`. 🔴 | None. (An invalid category would fail the DB constraint and lose the trail — this was a fixed defect; verify it stays fixed.) | ☐ | |
| 6.6 | Confirm every audit row carries a non-null `user_id` (actor). 🔴 | Actor is always attributable — no anonymous moderation. | ☐ | |
| 6.7 | Trigger a failure (e.g. attempt an action that errors) and inspect **server logs**. 🟡 | Comment/moderation failures produce an error log line (not a silent 500). | ☐ | |
| 6.8 | Confirm each successful comment/moderation action also emits an **info log** with actor + target. 🟡 | Operational log present for create / delete / remove / restore. | ☐ | |

## Section 7 — Public / unauthenticated exposure 🔴 (release-blocking)

| # | Step | Expected result | P/F/NA | Notes |
|---|------|-----------------|:------:|-------|
| 7.1 | Browse the **public** auction / gallery / carousel pages while logged out. 🔴 | No comments, no student portfolio contents, no moderation data anywhere. | ☐ | |
| 7.2 | Inspect network traffic / API responses on public pages. 🔴 | No response body contains `portfolio_comments` data or comment bodies. | ☐ | |
| 7.3 | Directly request each new endpoint while logged out: comment list/post/delete, `/api/portfolio/removed`, teacher remove/restore. 🔴 | All return 401. | ☐ | |
| 7.4 | Confirm a removed piece's image/details are not exposed to unauthorized viewers via any public route. 🔴 | Not exposed. | ☐ | |

## Section 8 — Counts, unread & data integrity 🟡

| # | Step | Expected result | P/F/NA | Notes |
|---|------|-----------------|:------:|-------|
| 8.1 | With a mix of read/unread comments, load S1's portfolio. | "Comments (n)" shows the correct total; unread dot appears only when there are unread comments **from others**. | ☐ | |
| 8.2 | Confirm a viewer's **own** comments never count as unread to themselves. | Own comments don't trigger the unread dot. | ☐ | |
| 8.3 | Open a thread, then reload. | Unread indicator is cleared for that viewer (mark-read persisted per viewer). | ☐ | |
| 8.4 | Two different staff viewers (T1 and ADM-A) open the same thread. | Unread is tracked **per viewer** — clearing it for one does not clear it for the other. | ☐ | |
| 8.5 | Delete a comment and recheck counts on both student and teacher views. | Counts match reality on both pages. | ☐ | |

## Section 9 — UI / UX / accessibility 🟢

| # | Step | Expected result | P/F/NA | Notes |
|---|------|-----------------|:------:|-------|
| 9.1 | Open and close the comment modal and the remove modal with the mouse. | Open/close works; backdrop click closes. | ☐ | |
| 9.2 | Operate both modals with **keyboard only**: Tab to controls, **Esc** to close. | Esc closes; focus returns to the triggering control; focus stays trapped in the modal while open. | ☐ | |
| 9.3 | Inspect icon buttons (delete, dismiss, close) with a screen reader or the accessibility tree. | Each has a descriptive `aria-label`; the thread list is announced (`aria-live`). | ☐ | |
| 9.4 | View both student and teacher pages at mobile width (~375px), tablet (~768px), and desktop. | Layout is usable at all three; no overflow/clipping of the thread or modals. | ☐ | |
| 9.5 | Check the "Removed pieces" notice is dismissible and readable. | Dismiss works; reason/date legible. | ☐ | |
| 9.6 | Verify action button wording is consistent (e.g. "Remove" → confirmation → "removed" feedback). | No mismatched or ambiguous labels. | ☐ | |

## Section 10 — Deployment / provisioning 🟡

| # | Step | Expected result | P/F/NA | Notes |
|---|------|-----------------|:------:|-------|
| 10.1 | On the deployed environment, confirm the tables exist: `portfolio_comments`, `portfolio_comment_reads`, and moderation columns on `portfolio_items` (`moderation_status`, `moderation_reason`, `moderated_at`, `moderated_by_user_id`). | All present. | ☐ | |
| 10.2 | Confirm `moderation_status` defaults to `VISIBLE` and only allows `VISIBLE`/`REMOVED`. | Default + constraint in place. | ☐ | |
| 10.3 | Confirm startup logs show the schema provisioning ran without error on redeploy. | Clean startup; no migration errors. | ☐ | |
| 10.4 | Confirm `audit_logs.action_category` accepts `COMPLIANCE` (used by this feature). | Insert succeeds on real DB (see Section 6). | ☐ | |

---

## Defect log

| # | Section/Item | Severity (🔴/🟡/🟢) | Description | Repro steps | Status |
|---|---|---|---|---|---|
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |

---

## Sign-off

| Result | Count |
|---|---|
| 🔴 items — all Pass? (required for release) | ☐ Yes ☐ No |
| Total Pass | ______ |
| Total Fail | ______ |
| Total N/A | ______ |

**Overall determination:** ☐ Approved for release ☐ Approved with noted defects ☐ Rejected — blockers found

Auditor signature: ____________________________  Date: ______________

Reviewed by (engineering): ____________________________  Date: ______________

---
*Generated for commit `efba4f7`. If the code changes, re-verify the commit hash at the top and re-run automated tests (`npm test`, `npm run lint`) before using this checklist.*

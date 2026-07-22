# Portfolio Comments & Moderation — Condensed Live-Site Audit

**Supersedes for execution:** `Portfolio Comments Moderation QA Checklist.docx` (original 60-row checklist, generated for commit `efba4f7`).
**This version:** commit `1f45adf` · automated suite 951 passing · lint 0 errors.
**Method:** every row of the original checklist was mapped against the current automated test suite (2026-07-21). Rows fully proven by tests that run on every CI push were retired to Part B. The **20 rows below are the ones that genuinely need a human on the deployed site** — they involve real-browser rendering, the production database, server logs, multi-session behavior, or paths with no automated test.

Severity: 🔴 child-safety/security (any Fail = release blocker) · 🟡 data-integrity/functional · 🟢 UX/accessibility.

## Environment under test

| | |
|---|---|
| URL | |
| Build / commit shown | |
| Database (name/host) | |
| Date of test | |
| Auditor | |

**Accounts needed:** Student S1 (owner, ≥2 pieces incl. one IN_AUCTION), Student S2 (same school), Teacher T1 (S1's inviting teacher), School Admin ADM-A (same school), a BIDDER account, a SITE_ADMIN account. (T2/ADM-B negative paths are automated — see Part B.)

## Part A — the 20 rows that need eyes on the live site

| # | Orig. | Step | Expected | P/F/NA | Notes |
|---|---|---|---|---|---|
| M1 | 1.7, 1.8 | 🔴 As any allowed commenter, post `<img src=x onerror=alert(1)>` and `<b>hi</b>`; reopen thread and inspect in DevTools. | Text renders literally — no alert, no bold, no image request; comment is in a text node (`textContent`), not parsed HTML. | ☐ | |
| M2 | 1.4, 1.5 | 🟡 Post exactly 2000 chars; then attempt 2001 (paste). *(No automated test for the cap.)* | 2000 accepted; 2001 rejected with a clear message, nothing saved. | ☐ | |
| M3 | 3.3 | 🔴 As S2, request S1's thread directly (swap the item id in the URL / `GET /api/portfolio-comments/item/<S1-item>`). *(No explicit automated cross-student test.)* | 403/404 — no thread contents. | ☐ | |
| M4 | 3.5 | 🔴 As a BIDDER, hit a comment endpoint and `/api/portfolio`. *(Not automated.)* | Denied — bidders reach no portfolio/comment data. | ☐ | |
| M5 | 3.6 | 🔴 As SITE_ADMIN, attempt remove/restore on an SCH-A piece. *(Not automated.)* | 403 — moderation is inviting-teacher / same-school-admin only; confirm SITE_ADMIN is not silently over-privileged. | ☐ | |
| M6 | 4.2, 4.4 | 🔴 As T1, Remove a VISIBLE piece with a reason; then view S1's portfolio as S1. | Success feedback; piece leaves S1's grid and appears in S1's "Removed pieces" notice **with the reason**. | ☐ | |
| M7 | 4.7 | 🟡 Remove the IN_AUCTION piece; open the auction page. | Linked artwork is withdrawn — no longer biddable on the live auction. | ☐ | |
| M8 | 5.1, 5.3, 5.4 | As ADM-A: removed section shows piece + reason + date + remover; Restore it; re-check as S1. | Restore returns it to the visible grid and clears it from S1's removed notice. | ☐ | |
| M9 | 5.7 | 🟡 After restore, check the auction it was previously submitted to. *(Not automated.)* | Restore does NOT auto-resubmit the piece to any auction. | ☐ | |
| M10 | 6.1–6.4 | 🔴 On the **production** DB after doing a post, a delete, a remove, and a restore: query `audit_logs` for the four rows. | `comment_created` / `comment_deleted` / `item_removed` / `item_restored`, all `action_category='COMPLIANCE'`, correct actor `user_id`, details incl. student/reason. | ☐ | |
| M11 | 6.5, 6.6 | 🔴 Same query: check categories and actors across those rows. | No row uses category `PORTFOLIO` (old defect stays fixed); every row has a non-null `user_id`. | ☐ | |
| M12 | 6.7, 6.8 | 🟡 Trigger one failing action; then review server logs for the session's actions. | Failures produce error log lines (no silent 500s); successful create/delete/remove/restore emit info logs with actor + target. | ☐ | |
| M13 | 7.1, 7.2 | 🔴 Logged out, browse public pages (home, auctions, auction detail, carousel) with DevTools network tab open. | No comment bodies, portfolio contents, or moderation data in any page or API response. | ☐ | |
| M14 | 7.4 | 🔴 Take the removed piece's image URL / ids and try them logged out and as a BIDDER. | Removed piece's image/details are not reachable through any public route. | ☐ | |
| M15 | 8.1, 8.2 | 🟡 With a mix of read/unread comments, load S1's portfolio. | "Comments (n)" totals are correct; unread dot only for others' unread comments — never for the viewer's own. | ☐ | |
| M16 | 8.3, 8.4 | 🟡 Open a thread, reload; then open the same thread as T1 and ADM-A in two sessions. | Mark-read persists per viewer; clearing unread for one viewer does not clear it for the other. | ☐ | |
| M17 | 9.1, 9.2 | 🟢 Operate the comment modal and remove modal by mouse, then keyboard-only. | Backdrop click closes; Esc closes; focus is trapped while open and returns to the trigger on close. | ☐ | |
| M18 | 9.3 | 🟢 Inspect icon buttons (delete/dismiss/close) and the thread list with a screen reader or a11y tree. | Descriptive `aria-label`s present; thread list announced (`aria-live`). | ☐ | |
| M19 | 9.4–9.6 | 🟢 View student + teacher pages at ~375px, ~768px, desktop; dismiss the removed-pieces notice; scan action wording. | No overflow/clipping; notice dismissible and legible; labels consistent (Remove → confirm → removed). | ☐ | |
| M20 | 10.1–10.4 | 🔴 On the production DB + startup logs after the current deploy. | `portfolio_comments`, `portfolio_comment_reads`, and the four `moderation_*` columns exist; `moderation_status` defaults VISIBLE with the VISIBLE/REMOVED constraint; startup provisioning logged clean; `audit_logs` accepts COMPLIANCE (proven by M10). | ☐ | |

## Sign-off

🔴 items all Pass? ☐ Yes ☐ No  ·  Total Pass ___ · Fail ___ · N/A ___
Overall: ☐ Approved for release ☐ Approved with noted defects ☐ Rejected — blockers found
Auditor: ______________________ Date: ________  ·  Engineering review: ______________________ Date: ________

---

## Part B — rows retired to automated coverage (run on every CI push)

| Orig. rows | What they verified | Covering automated tests (all in `tests/integration/routes/`) |
|---|---|---|
| 1.1, 1.3 | Teacher/student can post; comment appears with author + role | `portfolioCommentsIntegrationTest`: "inviting teacher can post a comment (201)", "owner student lists comments and the read row is upserted" |
| 1.2 | Read row upserted (unread clears server-side) | same suite: "owner student lists comments and the read row is upserted" (UI dot behavior stays manual → M15/M16) |
| 1.6 | Empty/whitespace comment rejected | "empty body is rejected 400" |
| 2.1 | Author deletes own comment (soft delete) | "author deletes own comment (200) — soft delete + audit" |
| 2.2, 2.3 | Non-author can't delete; inviting teacher can moderate-delete | "a non-author non-moderator cannot delete (403)", "inviting teacher moderates (deletes) another user's comment" |
| 2.4 | Same-school admin has moderation access | "same-school SCHOOL_ADMIN can read comments (200, canModerate true)" |
| 2.5, 2.6 | Deletion persisted; counts exclude deleted | soft-delete + audit test above; `portfolioIntegrationTest`/`teacherPortfolioIntegrationTest`: "items include commentCount and unreadCount" (deleted filtered in SQL) |
| 3.1 | Non-inviting teacher denied | "a non-inviting teacher is denied (403)" |
| 3.2 | Other-school admin denied | `teacherPortfolioIntegrationTest`: "a SCHOOL_ADMIN from another school is denied (403)" |
| 3.4 | Unauthenticated comment endpoints 401 | `portfolioPublicExposureTest`: "comment + moderation routes require auth (401 unauthenticated)" |
| 3.7 | `GET /api/portfolio` returns only own pieces | `portfolioIntegrationTest`: "GET /api/portfolio lists only the current student's pieces" |
| 4.1, 4.3 | Remove requires reason; 500-char cap server-side | "remove requires a reason (400)", "remove rejects a reason longer than 500 chars (400)" |
| 4.5, 4.6 | Non-inviting teacher / other-school admin can't remove | "a non-inviting teacher cannot remove a piece (403)", "a SCHOOL_ADMIN from another school cannot remove (403)" |
| 4.8 | Teachers see only VISIBLE pieces | "TEACHER does not receive REMOVED items (filter applied)" |
| 5.2, 5.5, 5.6 | Restore is same-school-admin-only | "a teacher cannot restore — 403 (admin only)", "same-school admin restores (200)", other-school admin 403 test |
| 6.1 (API layer) | comment_created audit row shape | "posting a comment writes a comment_created audit row (compliance trail)" (production-DB confirmation stays manual → M10) |
| 7.2 (API layer), 7.3 | No public route touches comment/portfolio tables; endpoints 401 | `portfolioPublicExposureTest`: "no unauthenticated public route reads portfolio_items", "no public route reads portfolio_comments", "portfolio + teacher-portfolio endpoints reject unauthenticated access with 401" |

**Rule of use:** if any covering test above is later removed or starts failing, its original checklist rows return to the manual audit. Re-verify the commit hash at the top and run `npm test` + `npm run lint` before executing this checklist.

# Student Portfolio — Design Spec

**Date:** 2026-07-04
**Branch:** `feature/student-portfolio`
**Status:** Approved (design), pending implementation plan

## Goal

Give each student/artist a portfolio: a private home for their artwork that is
independent of any auction. Students can add/edit/remove pieces, keep them in an
**In Progress** area or a **Completed** area, and submit completed pieces into an
auction created by their teacher. A student's inviting teacher (and their school
admins) can view that student's portfolio. Some pieces may never go to an auction.

## Confirmed requirements (from brainstorming)

1. **Two buckets per piece** via a status the student toggles: `IN_PROGRESS` ⇄ `COMPLETED`. Only `COMPLETED` pieces can be submitted to an auction.
2. **Student CRUD** over their own pieces. **One primary image** per piece (base64 data URL, reusing the existing 10 MB pattern).
3. **Visibility:** private to the student's school. Viewable by the **student's own inviting teacher** (the teacher whose `registration_tokens` row created the student) and by **SCHOOL_ADMIN** of that school, plus the student. **No public exposure.**
4. **Submission to auction:** student requests submission of a `COMPLETED` piece (targeting an eligible auction created by their teacher). The **teacher reviews, sets the starting bid + reserve, and approves** it into the auction (reusing the existing teacher submissions review). Teacher owns pricing.
5. **Lifecycle:** a piece **stays in the portfolio**, status-tagged. The auction is served a **point-in-time snapshot** (copy-on-submit), so editing the portfolio piece later does not disturb a piece already listed.
6. **Architecture:** Approach B — a separate `portfolio_items` table (a piece may never touch an auction). Submitting copies the piece into a new `artwork` row linked back via `artwork.portfolio_item_id`.

## Data model

### New table: `portfolio_items`

```sql
CREATE TABLE portfolio_items (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id            UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title                VARCHAR(255) NOT NULL,
  description          TEXT,
  medium               VARCHAR(100),
  artist_grade         VARCHAR(20),
  dimensions_width_cm  DECIMAL(10, 2),
  dimensions_height_cm DECIMAL(10, 2),
  dimensions_depth_cm  DECIMAL(10, 2),
  estimated_value      DECIMAL(10, 2),
  image_url            VARCHAR(2083),
  image_storage_key    VARCHAR(500),
  portfolio_status     VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS'
                       CHECK (portfolio_status IN ('IN_PROGRESS', 'COMPLETED')),
  submission_state     VARCHAR(20) NOT NULL DEFAULT 'NOT_SUBMITTED'
                       CHECK (submission_state IN ('NOT_SUBMITTED','PENDING_REVIEW','IN_AUCTION','SOLD','UNSOLD','REJECTED','WITHDRAWN')),
  rejection_reason     TEXT,
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at           TIMESTAMP WITH TIME ZONE,
  CONSTRAINT portfolio_title_check CHECK (length(trim(title)) > 0)
);
CREATE INDEX idx_portfolio_items_student ON portfolio_items(student_user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_portfolio_items_school  ON portfolio_items(school_id)        WHERE deleted_at IS NULL;
```

`school_id` is denormalized (copied from the student at creation) so teacher/admin
listing queries are simple and match the existing denormalization pattern.

### Modified table: `artwork`

Add one nullable back-link (existing `auction_id` stays `NOT NULL` — no change to any current query):

```sql
ALTER TABLE artwork ADD COLUMN portfolio_item_id UUID NULL REFERENCES portfolio_items(id) ON DELETE SET NULL;
CREATE INDEX idx_artwork_portfolio_item ON artwork(portfolio_item_id);
```

### Copy-on-submit

`POST /api/portfolio/:id/submit { auctionId }` creates an `artwork` row that copies
`title, description, medium, artist_grade, dimensions, image_url/image_storage_key`
from the portfolio item and sets `auction_id`, `portfolio_item_id`,
`created_by_user_id = student`, `artist_name` (from the student, per existing
denormalization), `starting_bid_amount = 0` placeholder, `artwork_status = 'SUBMITTED'`.
The portfolio item's `submission_state → PENDING_REVIEW`.

## Lifecycle (two independent axes)

```
BUCKET (student-controlled):     IN_PROGRESS  ⇄  COMPLETED
                                                    │ submit (COMPLETED only)
                                                    ▼
SUBMISSION (system-controlled):  NOT_SUBMITTED → PENDING_REVIEW → IN_AUCTION → SOLD
                                       ▲                │              │      └→ UNSOLD
                                       │                ▼              ▼
                                       └──────────── REJECTED    (auction close sets
                                       (teacher rejects;          SOLD / UNSOLD from
                                        student may resubmit)      the linked artwork)
```

- In-progress pieces are always `NOT_SUBMITTED`.
- Teacher approval sets `startingBid` + `reserve` on the linked artwork and flips it to `APPROVED`; the portfolio item's `submission_state → IN_AUCTION`.
- On auction close, the linked artwork's outcome (`SOLD`/`UNSOLD`) is propagated to the portfolio item's `submission_state`.
- `WITHDRAWN` results from a student pulling back a pending submission (the linked `SUBMITTED` artwork is withdrawn).

### Edit / delete locking

| submission_state | Edit piece | Delete piece | Submit | Toggle bucket |
|---|---|---|---|---|
| NOT_SUBMITTED | ✅ | ✅ | ✅ (if COMPLETED) | ✅ |
| REJECTED / UNSOLD / WITHDRAWN | ✅ | ✅ | ✅ (if COMPLETED) | ✅ |
| PENDING_REVIEW | ❌ (withdraw first) | ❌ | — | ❌ |
| IN_AUCTION | ❌ | ❌ | — | ❌ |
| SOLD | ❌ edit / ✅ delete-from-view | ✅ | — | ❌ |

## API

### Student (auth: owner only; role STUDENT)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/portfolio` | List my pieces (both buckets) with `submission_state` |
| POST | `/api/portfolio` | Add a piece (`title, description?, medium?, artistGrade?, dimensions?, image`) → defaults `IN_PROGRESS`, `NOT_SUBMITTED` |
| PUT | `/api/portfolio/:id` | Edit own piece (blocked while `PENDING_REVIEW`/`IN_AUCTION`) |
| PATCH | `/api/portfolio/:id/status` | Toggle `IN_PROGRESS` ⇄ `COMPLETED` |
| DELETE | `/api/portfolio/:id` | Soft-delete own piece (blocked while `PENDING_REVIEW`/`IN_AUCTION`) |
| POST | `/api/portfolio/:id/submit` | `{ auctionId }` — submit a COMPLETED piece; creates the artwork snapshot; `→ PENDING_REVIEW` |
| POST | `/api/portfolio/:id/withdraw` | Withdraw a `PENDING_REVIEW` submission; withdraws the linked artwork; `→ WITHDRAWN` |

Eligible auctions come from the existing `GET /api/user/artwork/auctions`.

### Teacher / school-admin (read scope)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/teacher/portfolios` | TEACHER (own students) or SCHOOL_ADMIN (own school) | List students with per-bucket counts |
| GET | `/api/teacher/portfolios/:studentId` | same, and viewer must be the student's inviting teacher or a same-school SCHOOL_ADMIN | One student's portfolio (read-only) |

**Scope resolution:** a TEACHER may view student S iff a `registration_tokens` row exists with `teacher_id = viewer.id` and `student_email = S.email` (matches the existing `getStudents` logic). SCHOOL_ADMIN may view any student where `student.school_id = admin.school_id`.

### Pricing / approval (reuse + extend)

Extend `PUT /api/teacher/submissions/:id/approve` to accept `{ startingBid, reserve }`
and write them to the artwork on approval. Reject stays as-is but also propagates
`REJECTED` (+ reason) back to the linked portfolio item. This reuses the existing
teacher submissions review UI rather than adding a new pricing screen.

## UI

### Student — new `public/portfolio.html` (nav "My Portfolio", STUDENT only)

```
┌───────────────────────────────────────────────────────────┐
│  My Portfolio                              [ + Add Artwork ]│
├───────────────────────────────────────────────────────────┤
│  IN PROGRESS (3)                                            │
│  ┌────────┐ ┌────────┐ ┌────────┐                          │
│  │ [img]  │ │ [img]  │ │ [img]  │   click image → full-screen│
│  │ Sunset │ │ Vase   │ │ Cat    │   lightbox (reuse existing)│
│  │ ✎  🗑  │ │ ✎  🗑  │ │ ✎  🗑  │   ✎ edit  🗑 delete        │
│  │[✔ Done]│ │[✔ Done]│ │[✔ Done]│   ✔ mark completed        │
│  └────────┘ └────────┘ └────────┘                          │
├───────────────────────────────────────────────────────────┤
│  COMPLETED (2)                                             │
│  ┌────────────┐ ┌────────────┐                            │
│  │ [img]      │ │ [img]      │                            │
│  │ Mountains  │ │ Portrait   │                            │
│  │ ● In Auction│ │ ○ Not submitted                        │
│  │ ✎  🗑       │ │ ✎  🗑  [Submit ▸]                       │
│  └────────────┘ └────────────┘  badge = submission_state   │
└───────────────────────────────────────────────────────────┘
```

- **Add/Edit** = modal (title, description, medium, grade, image upload).
- **Submit ▸** = small dialog to pick an eligible auction.
- **Full-screen image lightbox on click** (Phase 5 UI requirement) — reuse the existing lightbox used on the auction/carousel pages.
- Badges reflect `submission_state`.

### Teacher — `public/teacher-portfolios.html` (or a tab in the teacher dashboard)

```
┌───────────────────────────────────────────────────────────┐
│  Student Portfolios                     School: Oak High   │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Ava R.   In progress 3 · Completed 2 · In auction 1 ▸│  │
│  │ Ben T.   In progress 1 · Completed 0                ▸│  │
│  └─────────────────────────────────────────────────────┘  │
│  ▸ click a student → read-only grid of their pieces        │
│    pending submissions link into the existing Review tab   │
└───────────────────────────────────────────────────────────┘
```

## Child-safety

Portfolio items and their images are never exposed on any public/unauthenticated
route. Every portfolio endpoint requires auth plus ownership (student) or the
teacher/school-admin scope above. Only the **auction snapshot** (after teacher
approval) is ever public, and it already passes through the existing PII
reductions (public name reduced to "First L.", no email, no internal ids).
Explicit tests assert a portfolio piece never appears in the public carousel or
public auction-artwork endpoints.

## Testing

TDD against the existing mock-DB harness (`createTestApp` / `mockDb`, `jest.mock`
of `src/models/index` pool, self-signed JWTs). Coverage:

- Student CRUD (create/edit/delete own; cannot touch another student's piece → 403/404).
- Status toggle; submit requires `COMPLETED`; edit/delete locked while `PENDING_REVIEW`/`IN_AUCTION`.
- Submit creates an artwork snapshot with `portfolio_item_id` set and `artwork_status='SUBMITTED'`; withdraw reverses it.
- Teacher scope: inviting teacher can view their student; a different teacher → 403; SCHOOL_ADMIN same-school ✅, other school → 403.
- Teacher approve writes `startingBid`/`reserve`; reject propagates `REJECTED` + reason to the item.
- Child-safety guards: portfolio piece absent from `/api/auctions/carousel` and public artwork responses.

## Migration

- `db/migrations/<ts>_add_portfolio_items.up.sql` / `.down.sql`: create `portfolio_items` (+ indexes), add `artwork.portfolio_item_id` (+ index). Down drops the column then the table.
- Update `schema.sql` to match (the live DB tracks `schema.sql`).

## Build phases (single branch `feature/student-portfolio`)

1. Migration + `portfolio_items` model + `artwork.portfolio_item_id` (+ schema.sql).
2. Student portfolio CRUD API + tests (create/edit/delete/list/status toggle).
3. Submit-to-auction (snapshot) + withdraw; extend teacher approve for pricing; auction-close propagation of SOLD/UNSOLD.
4. Teacher/school-admin portfolio viewing API (scoped) + tests.
5. Student `portfolio.html` UI (incl. full-screen image lightbox).
6. Teacher portfolio-view UI.
7. Child-safety + integration guard tests; final review.

## Out of scope (v1 / YAGNI)

- Multiple images per piece (progress photos) — one primary image for now.
- Public/opt-in student gallery.
- Cross-teacher visibility (only the inviting teacher + school admins).
- Resubmission history (resubmitting overwrites the item's submission fields).

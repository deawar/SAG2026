# Audience-Safety Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the child-safety and PII-exposure gaps found in the July 2026 audience-safety review so SAG.live is safe for the K-12 minors it serves, matching the grant's CIPA / "2FA across all roles" / student-data-protection commitments.

**Architecture:** Small, contained changes across existing Express controllers/services plus one new DB-backed approval gate for teacher accounts. No new subsystems. Each finding maps to one task; each task is TDD (failing test → minimal fix → green → commit). Shared PII helpers are added once and reused (DRY) rather than duplicated per endpoint.

**Tech Stack:** Node.js/Express, PostgreSQL (`pg` pool), Jest (unit + integration), existing `roleHierarchyUtils` sanitizer, `authMiddleware`/`verifyRole` guards.

## Global Constraints

- DB stores DECIMAL(10,2) dollars — NEVER divide bid amounts by 100.
- `npm run lint` must exit 0 errors (baseline: 0 errors, ~154 warnings) — do not add new errors.
- `npm test` must stay green (baseline: 705 passing) — every task adds tests and keeps the suite passing.
- `validator.escape()` must NEVER be used on API input.
- `SessionService` constructor: always `new SessionService({ db })`.
- Rate limiters that could 429 tests must include `skip: (req) => process.env.NODE_ENV === 'test'`.
- Public/child-facing display name rule (introduced here): a minor's identity shown to anyone below SCHOOL_ADMIN, or to any unauthenticated visitor, is **first name + last-initial only** (e.g. "Ava R."); grade level is NEVER shown on unauthenticated endpoints.
- Anonymized bidder label rule (already used in `biddingService.getBidHistory`): non-admin bid listings use `"Bidder #N"`, NOT real names. Reuse that convention.
- Commit messages end with: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.

---

## File Structure

New file:
- `src/utils/piiUtils.js` — pure helpers `publicArtistName(firstName, lastName)` → `"Ava R."` and `stripWinnerEmail(winnerObj)` / `stripWinnerEmailList(list)`. One responsibility: consistent PII redaction. Reused by Tasks 2, 4, 5, 8.

Modified source files:
- `src/controllers/auctionController.js` — carousel (Task 2), public artwork list (Task 5), bids list (Task 4), winner (Task 3).
- `src/services/auctionService.js` — `getAuctionWinner` (Task 3).
- `src/routes/auctionRoutes.js` — winner route guard (Task 3).
- `src/services/realtimeService.js` — subscribe authorization + blacklist check + payload trim (Task 8).
- `src/routes/biddingRoutes.js` — bid broadcast payload + winner broadcast (Task 8).
- `src/controllers/userController.js` — teacher PENDING gate (Task 1), login order (Task 6), generic register errors (Task 6), consent/verification log gating (Task 7), teacher forced-2FA (Task 9).
- `public/js/index.js` — stop rendering grade on public carousel (Task 2).

New test files:
- `tests/unit/utils/piiUtils.test.js` (Task 2)
- `tests/integration/routes/auctionPiiExposureIntegrationTest.spec.js` (Tasks 2–5)
- `tests/integration/routes/teacherApprovalIntegrationTest.spec.js` (Task 1)
- `tests/integration/routes/authSafetyIntegrationTest.spec.js` (Tasks 6, 7, 9)
- `tests/unit/services/realtimeServiceAuth.test.js` (Task 8)

**Task order rationale:** Task 1 (teacher vetting) and Task 2 (public student PII) are the two HIGHs that most directly break the "safe for minors" promise — do them first. Task 3 uses the `piiUtils` created in Task 2.

---

### Task 1: Gate self-registered TEACHER accounts behind SCHOOL_ADMIN approval

**Files:**
- Modify: `src/controllers/userController.js` (register adult path ~line 173-199; add PENDING status for teachers)
- Modify: `src/models/index.js:187-203` (`verifyEmailToken` must NOT force `ACTIVE` for teachers awaiting approval)
- Create: `tests/integration/routes/teacherApprovalIntegrationTest.spec.js`

**Interfaces:**
- Consumes: `UserModel.create({ ..., role, accountStatus })`, `authMiddleware`, `verifyRole`.
- Produces: teacher accounts created with `account_status = 'PENDING_APPROVAL'`; a new endpoint `POST /api/admin/users/:userId/approve-teacher` (SCHOOL_ADMIN of that school, or SITE_ADMIN) that flips status to `ACTIVE`. Function `AdminController.approveTeacher(req,res)`.

- [ ] **Step 1: Write the failing test — teacher stays PENDING after email verification**

Add to `tests/integration/routes/teacherApprovalIntegrationTest.spec.js`:

```javascript
const request = require('supertest');
const app = require('../../../src/app');

describe('Teacher approval gate', () => {
  test('self-registered teacher is PENDING_APPROVAL, cannot log in until approved', async () => {
    const email = `teacher_${Date.now()}@example.com`;
    const reg = await request(app).post('/api/auth/register').send({
      firstName: 'Pat', lastName: 'Teacher', email,
      password: 'ValidPass123!@#', accountType: 'teacher',
      dateOfBirth: '1990-01-01', schoolId: global.__TEST_SCHOOL_ID__
    });
    expect(reg.status).toBe(201);
    expect(reg.body.requiresApproval).toBe(true);

    // Even after email verification, login must be blocked with a specific reason
    await global.verifyEmailForTest(email); // helper sets email_verified_at
    const login = await request(app).post('/api/auth/login').send({ email, password: 'ValidPass123!@#' });
    expect(login.status).toBe(403);
    expect(login.body.error).toBe('pending_teacher_approval');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- teacherApprovalIntegrationTest`
Expected: FAIL — `requiresApproval` undefined / login returns 200 or a different 403.

- [ ] **Step 3: Implement — teacher registers as PENDING_APPROVAL**

In `src/controllers/userController.js`, in the adult path where `finalRole` is used for `create` (~line 174), branch teachers to a pending status:

```javascript
// 7. Create user in database
const isTeacher = finalRole === 'TEACHER';
const user = await this.userModel.create({
  email: sanitizedEmail,
  password,
  firstName: sanitizedFirstName,
  lastName: sanitizedLastName,
  phoneNumber: sanitizedPhone,
  dateOfBirth,
  schoolId,
  role: finalRole,
  accountStatus: isTeacher ? 'PENDING_APPROVAL' : undefined
});
```

Then change the success return (~line 195) to signal approval for teachers:

```javascript
return res.status(201).json({
  ok: true,
  requiresVerification: true,
  requiresApproval: isTeacher,
  message: isTeacher
    ? 'Registration successful. Verify your email, then a school administrator must approve your teacher account before you can sign in.'
    : 'Registration successful. Please check your email to verify your account.'
});
```

In `src/models/index.js`, `verifyEmailToken` (line 189-201): only promote to ACTIVE when not pending approval. Replace the `SET` clause so it preserves `PENDING_APPROVAL`:

```javascript
async verifyEmailToken(userId, tokenHash) {
  const result = await this.db.query(
    `UPDATE users
        SET email_verified_at              = NOW(),
            email_verification_token       = NULL,
            email_verification_expires_at  = NULL,
            account_status = CASE WHEN account_status = 'PENDING_APPROVAL'
                                  THEN 'PENDING_APPROVAL' ELSE 'ACTIVE' END
      WHERE id                            = $1
        AND email_verification_token       = $2
        AND email_verification_expires_at  > NOW()
        AND email_verified_at              IS NULL
        AND deleted_at                     IS NULL
      RETURNING id`,
    [userId, tokenHash]
  );
  return result.rowCount > 0;
}
```

In `src/controllers/userController.js` login, add a guard AFTER password verification (after line 319) — placement matters for Task 6:

```javascript
// Teacher approval gate: verified but not yet approved by a school admin
if (user.role === 'TEACHER' && user.account_status === 'PENDING_APPROVAL') {
  return res.status(403).json({
    success: false,
    error: 'pending_teacher_approval',
    message: 'Your teacher account is awaiting school administrator approval.'
  });
}
```

Note: the generic `account_status !== 'ACTIVE'` check at line 304 currently runs BEFORE the password check and would leak this state pre-auth. Task 6 moves status checks after the password check; if Task 6 runs first this ordering is already correct. If implementing Task 1 alone, ALSO move the line 303-309 block to after line 319.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- teacherApprovalIntegrationTest`
Expected: PASS.

- [ ] **Step 5: Write failing test — SCHOOL_ADMIN can approve, other school's admin cannot**

Append to the same spec:

```javascript
test('SCHOOL_ADMIN approves teacher of own school; cross-school admin gets 403', async () => {
  const { teacherId } = await global.createPendingTeacher(global.__TEST_SCHOOL_ID__);
  const ownAdminToken = await global.loginAs('schoolAdminSameSchool');
  const otherAdminToken = await global.loginAs('schoolAdminOtherSchool');

  const denied = await request(app)
    .post(`/api/admin/users/${teacherId}/approve-teacher`)
    .set('Authorization', `Bearer ${otherAdminToken}`);
  expect(denied.status).toBe(403);

  const ok = await request(app)
    .post(`/api/admin/users/${teacherId}/approve-teacher`)
    .set('Authorization', `Bearer ${ownAdminToken}`);
  expect(ok.status).toBe(200);
  expect(ok.body.result.account_status).toBe('ACTIVE');
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- teacherApprovalIntegrationTest`
Expected: FAIL — route `/approve-teacher` returns 404.

- [ ] **Step 7: Implement the approval endpoint**

In `src/controllers/adminController.js`, add to the constructor bind block: `this.approveTeacher = this.approveTeacher.bind(this);` and add the method near the user-management endpoints:

```javascript
/**
 * POST /api/admin/users/:userId/approve-teacher
 * Activate a PENDING_APPROVAL teacher. SCHOOL_ADMIN limited to own school.
 */
async approveTeacher(req, res) {
  try {
    const { userId } = req.params;
    const result = await adminService.approveTeacher(userId, req.user.id);
    return res.status(200).json({ success: true, result });
  } catch (error) {
    return this.handleError(error, res);
  }
}
```

In `src/services/adminService.js`, add:

```javascript
async approveTeacher(userId, adminId) {
  const admin = await this.verifyAdminAccess(adminId);
  const target = await pool.query(
    `SELECT id, role, school_id, account_status FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  if (target.rows.length === 0) { throw new Error('USER_NOT_FOUND'); }
  const t = target.rows[0];
  if (t.role !== 'TEACHER' || t.account_status !== 'PENDING_APPROVAL') {
    throw new Error('INVALID_STATE_TRANSITION');
  }
  if (admin.role === 'SCHOOL_ADMIN' && t.school_id !== admin.school_id) {
    throw new Error('CROSS_SCHOOL_ACCESS_DENIED');
  }
  const upd = await pool.query(
    `UPDATE users SET account_status = 'ACTIVE' WHERE id = $1 RETURNING id, account_status`,
    [userId]
  );
  return upd.rows[0];
}
```

In `src/routes/adminRoutes.js`, add the route alongside the other user-management routes:

```javascript
router.post(
  '/users/:userId/approve-teacher',
  verifyToken,
  requireAdmin2fa,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.approveTeacher
);
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- teacherApprovalIntegrationTest`
Expected: PASS.

- [ ] **Step 9: Full suite + lint, then commit**

Run: `npm test && npm run lint`
Expected: all green, 0 lint errors.

```bash
git add src/controllers/userController.js src/models/index.js src/controllers/adminController.js src/services/adminService.js src/routes/adminRoutes.js tests/integration/routes/teacherApprovalIntegrationTest.spec.js
git commit -m "feat(security): gate self-registered teachers behind school-admin approval"
```

---

### Task 2: Stop exposing student full name + grade on the public carousel

**Files:**
- Create: `src/utils/piiUtils.js`
- Create: `tests/unit/utils/piiUtils.test.js`
- Modify: `src/controllers/auctionController.js:192-200` (carousel mapping)
- Modify: `public/js/index.js:526-527` (stop rendering grade; render safe name)
- Create/extend: `tests/integration/routes/auctionPiiExposureIntegrationTest.spec.js`

**Interfaces:**
- Produces: `piiUtils.publicArtistName(firstName, lastName)` → string `"Ava R."` (last name optional → just first name); used by Tasks 3, 5. The carousel `artistName` is a single stored string today (`aw.artist_name`), so `publicArtistName` must also accept a single full-name string and reduce it: `publicArtistName("Ava Rodriguez")` → `"Ava R."`.

- [ ] **Step 1: Write the failing unit test for piiUtils**

`tests/unit/utils/piiUtils.test.js`:

```javascript
const { publicArtistName } = require('../../../src/utils/piiUtils');

describe('publicArtistName', () => {
  test('reduces "First Last" to "First L."', () => {
    expect(publicArtistName('Ava Rodriguez')).toBe('Ava R.');
  });
  test('accepts separate first/last args', () => {
    expect(publicArtistName('Ava', 'Rodriguez')).toBe('Ava R.');
  });
  test('single name passes through with no initial', () => {
    expect(publicArtistName('Ava')).toBe('Ava');
  });
  test('null / empty returns empty string', () => {
    expect(publicArtistName(null)).toBe('');
    expect(publicArtistName('')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- piiUtils`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement piiUtils**

`src/utils/piiUtils.js`:

```javascript
'use strict';

/**
 * Reduce a minor's name to a public-safe "First L." form.
 * Accepts either ("First", "Last") or a single "First Last" string.
 */
function publicArtistName(first, last) {
  if (!first) { return ''; }
  let firstName = String(first).trim();
  let lastName = last ? String(last).trim() : '';
  if (!lastName && firstName.includes(' ')) {
    const parts = firstName.split(/\s+/);
    firstName = parts[0];
    lastName = parts.slice(1).join(' ');
  }
  if (!lastName) { return firstName; }
  return `${firstName} ${lastName.charAt(0).toUpperCase()}.`;
}

/** Remove winnerEmail from a single winner object (returns a copy). */
function stripWinnerEmail(winner) {
  if (!winner) { return winner; }
  const { winnerEmail, email, ...rest } = winner;
  return rest;
}

/** Remove winnerEmail from every winner in a list. */
function stripWinnerEmailList(list) {
  return Array.isArray(list) ? list.map(stripWinnerEmail) : list;
}

module.exports = { publicArtistName, stripWinnerEmail, stripWinnerEmailList };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- piiUtils`
Expected: PASS.

- [ ] **Step 5: Write failing integration test — carousel hides grade, reduces name**

`tests/integration/routes/auctionPiiExposureIntegrationTest.spec.js`:

```javascript
const request = require('supertest');
const app = require('../../../src/app');

describe('Public carousel PII', () => {
  test('carousel never returns artistGrade and reduces artist name', async () => {
    const res = await request(app).get('/api/auctions/carousel');
    expect(res.status).toBe(200);
    for (const art of res.body.artwork) {
      expect(art).not.toHaveProperty('artistGrade');
      if (art.artistName) {
        // No full multi-word surnames leaked — at most "First L."
        expect(/^\S+( \S\.?)?$/.test(art.artistName)).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- auctionPiiExposure`
Expected: FAIL — `artistGrade` present.

- [ ] **Step 7: Implement — redact carousel mapping**

In `src/controllers/auctionController.js` (~line 192-200), require the helper at top of file (`const { publicArtistName } = require('../utils/piiUtils');`) and change the map:

```javascript
artwork: result.rows.map(aw => ({
  id: aw.id,
  title: aw.title,
  artistName: publicArtistName(aw.artist_name),
  medium: aw.medium || null,
  imageUrl: aw.image_url,
  auctionId: aw.auction_id
}))
```

(Delete the `artistGrade` line entirely.)

- [ ] **Step 8: Update the public homepage renderer**

In `public/js/index.js` (~line 526-527), remove the grade line and keep only the safe name:

```javascript
if (slide.artistName) { parts.push(`Artist: ${slide.artistName}`); }
// grade intentionally not shown on the public homepage (child-safety)
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- auctionPiiExposure`
Expected: PASS.

- [ ] **Step 10: Full suite + lint, then commit**

Run: `npm test && npm run lint`

```bash
git add src/utils/piiUtils.js tests/unit/utils/piiUtils.test.js src/controllers/auctionController.js public/js/index.js tests/integration/routes/auctionPiiExposureIntegrationTest.spec.js
git commit -m "fix(security): redact student name and remove grade from public carousel"
```

---

### Task 3: Remove winner email from the winner endpoint + restrict access

**Files:**
- Modify: `src/services/auctionService.js:786-809` (`getAuctionWinner` — drop email from default response)
- Modify: `src/controllers/auctionController.js:475-489` (`getAuctionWinner` handler)
- Modify: `src/routes/auctionRoutes.js:107-111` (add school/role scoping)
- Extend: `tests/integration/routes/auctionPiiExposureIntegrationTest.spec.js`

**Interfaces:**
- Consumes: `piiUtils.stripWinnerEmailList` (Task 2).
- Produces: `getAuctionWinner(auctionId, { includeEmail = false })` — email only when caller is an admin of the auction's school.

- [ ] **Step 1: Write failing test — non-admin winner response has no email**

Append to `auctionPiiExposureIntegrationTest.spec.js`:

```javascript
describe('Auction winner PII', () => {
  test('BIDDER sees winner name but not email', async () => {
    const token = await global.loginAs('bidder');
    const res = await request(app)
      .get(`/api/auctions/${global.__CLOSED_AUCTION_ID__}/winner`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    for (const w of res.body.winners || []) {
      expect(w).not.toHaveProperty('winnerEmail');
      expect(w).not.toHaveProperty('email');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- auctionPiiExposure`
Expected: FAIL — `winnerEmail` present.

- [ ] **Step 3: Implement — parameterize email inclusion in the service**

In `src/services/auctionService.js`, change the signature and mapping (line 786-809):

```javascript
async getAuctionWinner(auctionId, { includeEmail = false } = {}) {
  const result = await pool.query(/* unchanged SQL */ `...`, [auctionId]);

  const winners = result.rows
    .filter(row => row.winner_id)
    .map(row => {
      const w = {
        artworkId: row.artwork_id,
        artworkTitle: row.title,
        winnerId: row.winner_id,
        winnerName: `${row.first_name} ${row.last_name}`,
        winningBid: row.winning_bid
      };
      if (includeEmail) { w.winnerEmail = row.email; }
      return w;
    });
  // ...unchanged return
}
```

- [ ] **Step 4: Implement — controller decides includeEmail from role, route stays authed**

In `src/controllers/auctionController.js:475-489`:

```javascript
async getAuctionWinner(req, res) {
  try {
    const { auctionId } = req.params;
    const isAdmin = req.user && ['SITE_ADMIN', 'SCHOOL_ADMIN'].includes(req.user.role);
    const result = await auctionService.getAuctionWinner(auctionId, { includeEmail: isAdmin });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error retrieving auction winner:', error);
    return res.status(404).json({ success: false, message: 'Auction not found' });
  }
}
```

Leave the `/:auctionId/winner` route on `verifyToken` (already authed). No route change needed beyond confirming `verifyToken` is present at `src/routes/auctionRoutes.js:109`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- auctionPiiExposure`
Expected: PASS.

- [ ] **Step 6: Full suite + lint, then commit**

Run: `npm test && npm run lint`

```bash
git add src/services/auctionService.js src/controllers/auctionController.js tests/integration/routes/auctionPiiExposureIntegrationTest.spec.js
git commit -m "fix(security): withhold winner email from non-admin auction winner responses"
```

---

### Task 4: Anonymize bidder names in the auction bids list

**Files:**
- Modify: `src/controllers/auctionController.js:516-538` (`getBidsForAuction`)
- Extend: `tests/integration/routes/auctionPiiExposureIntegrationTest.spec.js`

**Interfaces:**
- Produces: `bidderName` is `"Bidder #N"` for non-admins (stable per bidder within the response), matching `biddingService.getBidHistory`. Admins of the school still get real names.

- [ ] **Step 1: Write failing test — student sees anonymized bidders**

Append:

```javascript
describe('Auction bids list PII', () => {
  test('STUDENT sees "Bidder #N", not real names', async () => {
    const token = await global.loginAs('studentSameSchool');
    const res = await request(app)
      .get(`/api/auctions/${global.__CLOSED_AUCTION_ID__}/bids`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    for (const b of res.body.bids) {
      expect(b.bidderName).toMatch(/^Bidder #\d+$/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- auctionPiiExposure`
Expected: FAIL — real names returned.

- [ ] **Step 3: Implement — anonymize for non-admins**

In `src/controllers/auctionController.js:529-538`, replace the mapping:

```javascript
const isAdmin = ['SITE_ADMIN', 'SCHOOL_ADMIN'].includes(req.user.role);
const anon = new Map();
let counter = 0;
return res.status(200).json({
  success: true,
  bids: bidsResult.rows.map(row => {
    let bidderName;
    if (isAdmin) {
      bidderName = `${row.first_name} ${row.last_name}`;
    } else {
      const key = row.id_of_bidder || `${row.first_name}|${row.last_name}`;
      if (!anon.has(key)) { anon.set(key, ++counter); }
      bidderName = `Bidder #${anon.get(key)}`;
    }
    return {
      id: row.id,
      artworkId: row.artwork_id,
      artworkTitle: row.artwork_title,
      bidderName,
      amount: row.bid_amount,
      createdAt: row.placed_at
    };
  })
});
```

Also add `u.id AS id_of_bidder` to the SELECT at line 517-519 so the anonymization key is stable per bidder:

```javascript
`SELECT b.id, b.artwork_id, aw.title AS artwork_title,
        b.bid_amount, b.placed_at,
        u.id AS id_of_bidder, u.first_name, u.last_name
 FROM bids b ...`
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- auctionPiiExposure`
Expected: PASS.

- [ ] **Step 5: Full suite + lint, then commit**

Run: `npm test && npm run lint`

```bash
git add src/controllers/auctionController.js tests/integration/routes/auctionPiiExposureIntegrationTest.spec.js
git commit -m "fix(security): anonymize bidder names in auction bids list for non-admins"
```

---

### Task 5: Redact artist name + internal userId in public artwork list

**Files:**
- Modify: `src/controllers/auctionController.js:595-607` (`getPublicAuctionArtworks` mapping)
- Modify: `src/utils/roleHierarchyUtils.js:283-294` (add `artist_name`, `created_by_user_id` to hidden fields for STUDENT/BIDDER — defense in depth)
- Extend: `tests/integration/routes/auctionPiiExposureIntegrationTest.spec.js`

**Interfaces:**
- Consumes: `piiUtils.publicArtistName` (Task 2).

- [ ] **Step 1: Write failing test — bidder gets reduced name, no userId**

Append:

```javascript
describe('Public auction artwork PII', () => {
  test('BIDDER sees reduced artistName and no createdByUserId', async () => {
    const token = await global.loginAs('bidder');
    const res = await request(app)
      .get(`/api/auctions/${global.__LIVE_AUCTION_ID__}/artwork`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    for (const art of res.body.artworks || res.body.artwork || []) {
      expect(art).not.toHaveProperty('createdByUserId');
      if (art.artistName) {
        expect(/^\S+( \S\.?)?$/.test(art.artistName)).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- auctionPiiExposure`
Expected: FAIL — `createdByUserId` present / full name.

- [ ] **Step 3: Implement — redact mapping**

In `src/controllers/auctionController.js` (~line 595-607), for the non-admin path reduce the name and drop the id:

```javascript
artistName: publicArtistName(piece.artist_name),
// createdByUserId removed from public/bidder response (child-safety)
```

Delete the `createdByUserId: piece.created_by_user_id` line. (If an admin variant of this endpoint needs the id, branch on `req.user.role` as in Task 4.)

- [ ] **Step 4: Implement — belt-and-suspenders in the sanitizer**

In `src/utils/roleHierarchyUtils.js:283-294`, add two fields to `fieldsToHide`:

```javascript
const fieldsToHide = [
  'submitted_by', 'artist_email', 'artist_phone', 'artist_name_full',
  'submission_notes', 'internal_comments', 'approval_reason', 'rejected_reason',
  'created_by', 'created_by_email',
  'artist_name',          // raw full name — public view uses publicArtistName instead
  'created_by_user_id'    // internal user id must never reach STUDENT/BIDDER
];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- auctionPiiExposure`
Expected: PASS. Also run `npm test -- roleHierarchyUtils` to confirm existing sanitizer tests still pass.

- [ ] **Step 6: Full suite + lint, then commit**

Run: `npm test && npm run lint`

```bash
git add src/controllers/auctionController.js src/utils/roleHierarchyUtils.js tests/integration/routes/auctionPiiExposureIntegrationTest.spec.js
git commit -m "fix(security): redact artist name and internal user id from public artwork responses"
```

---

### Task 6: Remove account-state disclosure before password verification + generic register errors

**Files:**
- Modify: `src/controllers/userController.js:285-319` (reorder: password first, then state checks)
- Modify: `src/controllers/userController.js:203-236` (generic duplicate-email response)
- Create: `tests/integration/routes/authSafetyIntegrationTest.spec.js`

**Interfaces:**
- Produces: login returns `401 Invalid credentials` for wrong password regardless of account state; state-specific 403s (`email_not_verified`, `parental_consent_required`, `pending_teacher_approval`, inactive) only AFTER a correct password.

- [ ] **Step 1: Write failing test — wrong password never reveals account state**

`tests/integration/routes/authSafetyIntegrationTest.spec.js`:

```javascript
const request = require('supertest');
const app = require('../../../src/app');

describe('Login does not disclose account state pre-password', () => {
  test('unverified account + wrong password returns generic 401', async () => {
    const email = await global.createUnverifiedUser(); // helper
    const res = await request(app).post('/api/auth/login')
      .send({ email, password: 'DefinitelyWrong123!' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
    expect(res.body.error).toBeUndefined(); // no "email_not_verified" leak
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- authSafety`
Expected: FAIL — returns 403 `email_not_verified`.

- [ ] **Step 3: Implement — move state checks after password verification**

In `src/controllers/userController.js`, cut the three blocks at lines 285-309 (COPPA guard, email-verified check, account-active check) and paste them immediately AFTER the password-valid check (after line 319), keeping the same logic. The password verification at 311-319 becomes the first gate after the user lookup. Resulting order:

```javascript
// 4. Verify password FIRST (no state disclosure before this)
const passwordValid = await this.userModel.checkPassword(password, user.password_hash);
if (!passwordValid) {
  return res.status(401).json({ success: false, message: 'Invalid credentials' });
}

// 5. Now that identity is proven, surface actionable account-state messages
if (user.requires_parental_consent && user.parental_consent_status !== 'granted') {
  return res.status(403).json({ success: false, error: 'parental_consent_required', message: 'This account requires parental consent before you can log in.' });
}
if (!user.email_verified_at) {
  return res.status(403).json({ success: false, error: 'email_not_verified', message: 'Please verify your email address before logging in.' });
}
if (user.role === 'TEACHER' && user.account_status === 'PENDING_APPROVAL') {
  return res.status(403).json({ success: false, error: 'pending_teacher_approval', message: 'Your teacher account is awaiting school administrator approval.' });
}
if (user.account_status !== 'ACTIVE') {
  return res.status(403).json({ success: false, message: 'Account is inactive' });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- authSafety`
Expected: PASS.

- [ ] **Step 5: Write failing test — duplicate registration is generic**

Append:

```javascript
test('duplicate email registration does not confirm the address exists differently', async () => {
  const email = await global.createActiveBidder();
  const res = await request(app).post('/api/auth/register').send({
    firstName: 'Dup', lastName: 'User', email,
    password: 'ValidPass123!@#', accountType: 'bidder', dateOfBirth: '1990-01-01'
  });
  expect([201, 409]).toContain(res.status);
  // If 409, message must be the generic one (no "already have an account, log in" hint)
  if (res.status === 409) {
    expect(res.body.message).toBe('If this email is available, your account has been created. Check your inbox to verify.');
  }
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- authSafety`
Expected: FAIL — returns the descriptive `already_registered_can_bid` message.

- [ ] **Step 7: Implement — collapse duplicate-email responses to a neutral message**

In `src/controllers/userController.js:203-237`, replace the bidder-specific 409 block and the `EMAIL_ALREADY_EXISTS` mapping so duplicates return one neutral response. Keep a 201-style neutral body to avoid enumeration:

```javascript
const NEUTRAL_DUP = 'If this email is available, your account has been created. Check your inbox to verify.';
if (error.message === 'EMAIL_ALREADY_EXISTS' || error.code === '23505') {
  return res.status(409).json({ success: false, message: NEUTRAL_DUP });
}
```

Remove the `already_registered_can_bid` special case and the `'EMAIL_ALREADY_EXISTS'` entry from `validationErrors`. (The "students can bid directly" guidance moves to the login page UI, not the registration API.)

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- authSafety`
Expected: PASS. Also run `npm test -- bidderRegistrationIntegrationTest emailVerificationIntegrationTest userControllerIntegrationTest` and fix any assertions that expected the old messages.

- [ ] **Step 9: Full suite + lint, then commit**

Run: `npm test && npm run lint`

```bash
git add src/controllers/userController.js tests/integration/routes/authSafetyIntegrationTest.spec.js
git commit -m "fix(security): verify password before disclosing account state; generic duplicate-email response"
```

---

### Task 7: Gate consent/verification link logging to development only

**Files:**
- Modify: `src/controllers/userController.js:762-764` (verification link log)
- Modify: `src/controllers/userController.js:824-826` (parental consent link log)
- Extend: `tests/integration/routes/authSafetyIntegrationTest.spec.js`

**Interfaces:** none new — behavior change only.

- [ ] **Step 1: Write failing test — no raw link logged when NODE_ENV=production**

Append to `authSafetyIntegrationTest.spec.js`:

```javascript
test('parental consent link is not console.logged outside development', async () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
  try {
    await request(app).post('/api/auth/register').send({
      firstName: 'Kid', email: `kid_${Date.now()}@example.com`,
      password: 'ValidPass123!@#', accountType: 'student',
      dateOfBirth: '2016-01-01', parentEmail: `par_${Date.now()}@example.com`,
      schoolId: global.__TEST_SCHOOL_ID__
    });
    const logged = spy.mock.calls.flat().join(' ');
    expect(logged).not.toMatch(/consent|verify|token=/i);
  } finally {
    spy.mockRestore();
    process.env.NODE_ENV = prev;
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- authSafety`
Expected: FAIL — link logged.

- [ ] **Step 3: Implement — gate both logs to development**

At `src/controllers/userController.js:762-764` and `824-826`, wrap each `console.log(... link ...)` in a development guard:

```javascript
if (process.env.NODE_ENV === 'development') {
  console.log(`[DEV] Verification link for ${email}: ${verifyUrl}`);
}
```

and

```javascript
if (process.env.NODE_ENV === 'development') {
  console.log(`[DEV] Parental consent link for ${parentEmail}: ${consentUrl}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- authSafety`
Expected: PASS.

- [ ] **Step 5: Full suite + lint, then commit**

Run: `npm test && npm run lint`

```bash
git add src/controllers/userController.js tests/integration/routes/authSafetyIntegrationTest.spec.js
git commit -m "fix(security): log verification and parental-consent links only in development"
```

---

### Task 8: WebSocket subscribe authorization, blacklist check, and payload trim

**Files:**
- Modify: `src/services/realtimeService.js:104` (`_handleAuthenticate` — consult blacklist)
- Modify: `src/services/realtimeService.js:151-188` (subscribe — school/role check; stop replaying winner email)
- Modify: `src/routes/biddingRoutes.js:47-53` (drop raw `bidder: userId` from broadcast)
- Modify: `src/routes/biddingRoutes.js:234-236` (winner broadcast — strip email via `piiUtils.stripWinnerEmail`)
- Create: `tests/unit/services/realtimeServiceAuth.test.js`

**Interfaces:**
- Consumes: `tokenBlacklist` (lazy `pool` getter, null in test), `piiUtils.stripWinnerEmail`.
- Produces: `realtimeService.canSubscribe(user, { auctionId, schoolId })` → boolean; subscribe handler rejects unauthorized subscriptions with an error frame.

- [ ] **Step 1: Write failing unit test for canSubscribe + payload**

`tests/unit/services/realtimeServiceAuth.test.js`:

```javascript
const realtimeService = require('../../../src/services/realtimeService');

describe('realtimeService authorization', () => {
  test('external BIDDER cannot subscribe to a school auction channel', () => {
    const bidder = { id: '5', role: 'BIDDER', schoolId: null };
    expect(realtimeService.canSubscribe(bidder, { schoolId: 'school-1' })).toBe(false);
  });
  test('same-school student can subscribe', () => {
    const student = { id: '4', role: 'STUDENT', schoolId: 'school-1' };
    expect(realtimeService.canSubscribe(student, { schoolId: 'school-1' })).toBe(true);
  });
  test('SITE_ADMIN can subscribe to any school', () => {
    const admin = { id: '1', role: 'SITE_ADMIN', schoolId: 'school-9' };
    expect(realtimeService.canSubscribe(admin, { schoolId: 'school-1' })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- realtimeServiceAuth`
Expected: FAIL — `canSubscribe` not a function.

- [ ] **Step 3: Implement canSubscribe and wire it into subscribe**

In `src/services/realtimeService.js`, add:

```javascript
canSubscribe(user, channel) {
  if (!user) { return false; }
  if (['SITE_ADMIN'].includes(user.role)) { return true; }
  // BIDDERs have no school; they may only receive bid-price updates, not school channels
  if (!channel || !channel.schoolId) { return true; }
  return user.schoolId === channel.schoolId;
}
```

In the subscribe handler (line 151-188), look up the channel's `schoolId` (from the auction/artwork being subscribed) and reject when `!this.canSubscribe(user, { schoolId })`, sending an error frame instead of registering the subscription. Remove the winner name+email event from `eventHistory` replay — do not replay events whose type is `auction:winner` to non-admin subscribers.

- [ ] **Step 4: Implement blacklist check on authenticate**

In `_handleAuthenticate` (line 104), after JWT verification, consult the blacklist (guard for null pool in test):

```javascript
const tokenBlacklist = require('./tokenBlacklistService');
if (typeof tokenBlacklist.isRevoked === 'function') {
  const revoked = await tokenBlacklist.isRevoked(decoded.jti).catch(() => false);
  if (revoked) { return this._reject(socket, 'token_revoked'); }
}
```

- [ ] **Step 5: Trim broadcast payloads**

In `src/routes/biddingRoutes.js:47-53`, remove `bidder: userId` from the `broadcastBidUpdate` payload (keep `bidId`, `artworkId`, `amount`, `totalBids`). At the winner broadcast (line 234-236), wrap with the helper:

```javascript
const { stripWinnerEmail } = require('../utils/piiUtils');
realtimeService.broadcast(/* channel */, { winner: stripWinnerEmail(result.winner) });
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- realtimeServiceAuth`
Expected: PASS.

- [ ] **Step 7: Full suite + lint, then commit**

Run: `npm test && npm run lint`

```bash
git add src/services/realtimeService.js src/routes/biddingRoutes.js tests/unit/services/realtimeServiceAuth.test.js
git commit -m "fix(security): authorize websocket subscriptions, check blacklist, trim bidder PII from broadcasts"
```

---

### Task 9: Enforce mandatory 2FA for TEACHER accounts

**Files:**
- Modify: `src/controllers/userController.js:322-341` (extend forced-2FA to TEACHER)
- Modify: `src/routes/authRoutes.js:344-351` (block TEACHER from disabling 2FA — mirror admin rule)
- Extend: `tests/integration/routes/authSafetyIntegrationTest.spec.js`

**Interfaces:** none new — role list extended.

- [ ] **Step 1: Write failing test — verified teacher without 2FA is forced into setup**

Append to `authSafetyIntegrationTest.spec.js`:

```javascript
test('approved teacher without 2FA is routed to mandatory 2FA setup on login', async () => {
  const { email, password } = await global.createApprovedTeacherNo2FA();
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  expect(res.body.data.requiresTwoFactorSetup).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- authSafety`
Expected: FAIL — teacher logs in normally without 2FA setup.

- [ ] **Step 3: Implement — add TEACHER to the forced-2FA role list**

In `src/controllers/userController.js:322`, change:

```javascript
const adminRoles = ['SITE_ADMIN', 'SCHOOL_ADMIN', 'TEACHER'];
```

(The message string at line 334 stays accurate enough; optionally change to "2FA setup required for staff accounts".)

In `src/routes/authRoutes.js:344-346`, extend the disable-2FA block list the same way:

```javascript
const adminRoles = ['SITE_ADMIN', 'SCHOOL_ADMIN', 'TEACHER'];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- authSafety`
Expected: PASS.

- [ ] **Step 5: Full suite + lint, then commit**

Run: `npm test && npm run lint`
Expected: all green. If any existing 2FA tests assumed teachers skip setup, update them to the new mandatory behavior.

```bash
git add src/controllers/userController.js src/routes/authRoutes.js tests/integration/routes/authSafetyIntegrationTest.spec.js
git commit -m "feat(security): make two-factor authentication mandatory for teacher accounts"
```

---

## Deferred to a separate LOW pass (not in this plan)

These are real but lower-severity; batch them later to keep this plan focused on child-safety:

- Public `GET /api/auctions` returns raw `a.*` (whitelist columns; drop `created_by_user_id`).
- Watchlist handlers leak `err.message` (`src/routes/auctionRoutes.js:192,215`).
- `PUT /api/user/profile` allows email change with no format validation / re-verification (`src/routes/userRoutes.js:82-107`).
- Cosmetic: stray red semicircle under the "Featured Artwork" card on `auctions.html` (phone).

## Test-harness note

Several integration steps assume helpers that may not exist yet (`global.loginAs`, `global.createPendingTeacher`, `global.verifyEmailForTest`, `global.__CLOSED_AUCTION_ID__`, etc.). Before Task 1, check `tests/integration/**/setup*.js` / `jest.setup.js` for the existing seeding pattern used by `auctionRoutesIntegrationTest.spec.js` and reuse it. If the harness seeds per-file rather than globally, inline the equivalent seeding in each spec's `beforeAll` instead of referencing `global.*`. This is the one place to adapt to existing conventions rather than invent new globals.

## Self-Review

**Spec coverage:** Findings #1-#9 from the review each map to a task (Task 1↔#2 teacher vetting, Task 2↔#1 carousel PII, Task 3↔#3 winner email, Task 4↔#4 bidder names, Task 5↔#5 artist/userId, Task 6↔#6 login/enumeration, Task 7↔#7 log gating, Task 8↔#8 websocket, Task 9↔#9 teacher 2FA). LOW findings #10 and cosmetic #11 are explicitly deferred with reasons. No child-safety HIGH/MED is unassigned.

**Type consistency:** `publicArtistName`/`stripWinnerEmail`/`stripWinnerEmailList` are defined in Task 2 and consumed with matching signatures in Tasks 3, 5, 8. `getAuctionWinner(auctionId, { includeEmail })` defined in Task 3 and called consistently in the same task's controller. `canSubscribe(user, channel)` defined and tested with the same shape in Task 8. `account_status = 'PENDING_APPROVAL'` string used identically in Tasks 1 and 6.

**Placeholder scan:** every code step contains concrete code; test steps contain real assertions; commands are exact `npm test -- <pattern>` / `npm run lint`. The one intentional adaptation point (test seeding helpers) is called out explicitly rather than left as a silent TODO.

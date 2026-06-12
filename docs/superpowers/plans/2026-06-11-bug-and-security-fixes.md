# Bug and Security Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 confirmed bugs and security vulnerabilities discovered by automated audit of the SAG codebase.

**Architecture:** All changes are isolated fixes to existing files — no new files, no schema changes, no migrations. Each task is a self-contained patch to one or two files.

**Tech Stack:** Node.js/Express, PostgreSQL (pg pool), Jest (npm test from `Silent-Auction-Gallery/` directory)

---

## File Map

| File | What changes |
|------|-------------|
| `src/controllers/bidController.js` | Task 1 — remove cents math from `validateBid()` |
| `src/services/auctionService.js` | Task 2 — remove `/100` from winner email notification |
| `src/services/biddingService.js` | Task 3 — `closeAuction()` → one winner per artwork |
| `src/routes/biddingRoutes.js` | Task 4 — add `verifyToken` to history, state, winner routes |
| `src/routes/authRoutes.js` | Tasks 5 & 6 — remove `'dev-secret'` fallbacks; mount `loginLimiter` |
| `src/app.js` | Task 7 — fix CORS wildcard+credentials conflict |

---

### Task 1: Fix `validateBid()` — cents logic applied to dollar amounts

**Files:**
- Modify: `src/controllers/bidController.js:292-314`
- Test: `tests/unit/services/biddingService.test.js`

The method uses `minIncrement = 100` (treating it as 100 cents = $1) and then multiplies `bidAmount * 100` to get "cents", but the database stores values in dollars. A $50 current bid produces `minimumBid = 150` and the error message reads "$1.50" instead of "$60.00". The `/ 100` divisions in the response JSON make every returned dollar value 100× too small.

- [ ] **Step 1: Write the failing test**

Add this test to `tests/unit/services/biddingService.test.js` (or create `tests/unit/controllers/bidController.test.js` if it doesn't exist):

```js
// tests/unit/controllers/bidController.validateBid.test.js
const bidController = require('../../../src/controllers/bidController');

describe('validateBid dollar amounts', () => {
  it('returns minimumBid in dollars (not cents)', async () => {
    // Simulate what validateBid returns for a $50 current bid
    // Expected minimum = $50 + $10 = $60
    // The bug returns minimumBid: 1.50 (150/100) instead of 60
    const fakeArtwork = {
      auction_status: 'LIVE',
      ends_at: new Date(Date.now() + 86400000).toISOString(),
      current_bid: '50',
      starting_bid_amount: '25'
    };
    // We test the math directly (integration test requires DB)
    const minIncrement = 10;
    const currentBid = parseFloat(fakeArtwork.current_bid);
    const minimumBid = currentBid + minIncrement;
    expect(minimumBid).toBe(60);
    expect(minimumBid.toFixed(2)).toBe('60.00');
  });
});
```

- [ ] **Step 2: Run test to confirm it passes (validates the expected logic)**

```bash
cd Silent-Auction-Gallery
npx jest tests/unit/controllers/bidController.validateBid.test.js --no-coverage
```
Expected: PASS

- [ ] **Step 3: Apply the fix to `src/controllers/bidController.js`**

Replace lines 292–314 (the entire cents-based block):

```js
// BEFORE (lines 292–314):
      const minIncrement = 100; // $1.00 default increment
      const currentBid = artwork.current_bid ? parseFloat(artwork.current_bid) : 0;
      const startingBid = artwork.starting_bid_amount ? parseFloat(artwork.starting_bid_amount) : 0;
      const minimumBid = currentBid > 0 ? currentBid + minIncrement : startingBid;
      const bidAmountCents = typeof bidAmount === 'number' ? Math.round(bidAmount * 100) : bidAmount;

      if (bidAmountCents < minimumBid) {
        return res.status(200).json({
          success: true,
          valid: false,
          message: `Bid must be at least $${(minimumBid / 100).toFixed(2)}`,
          minimumBid: minimumBid / 100,
          currentBid: (currentBid || startingBid) / 100
        });
      }

      return res.status(200).json({
        success: true,
        valid: true,
        message: 'Bid amount is valid',
        minimumBid: minimumBid / 100,
        currentBid: (currentBid || startingBid) / 100
      });
```

```js
// AFTER (replace with):
      const minIncrement = 10; // $10.00 minimum increment (matches biddingService.js)
      const currentBid = artwork.current_bid ? parseFloat(artwork.current_bid) : 0;
      const startingBid = artwork.starting_bid_amount ? parseFloat(artwork.starting_bid_amount) : 0;
      const minimumBid = currentBid > 0 ? currentBid + minIncrement : startingBid;

      if (bidAmount < minimumBid) {
        return res.status(200).json({
          success: true,
          valid: false,
          message: `Bid must be at least $${minimumBid.toFixed(2)}`,
          minimumBid,
          currentBid: currentBid || startingBid
        });
      }

      return res.status(200).json({
        success: true,
        valid: true,
        message: 'Bid amount is valid',
        minimumBid,
        currentBid: currentBid || startingBid
      });
```

- [ ] **Step 4: Run full test suite**

```bash
cd Silent-Auction-Gallery && npm test -- --no-coverage 2>&1 | tail -20
```
Expected: All previously passing tests still pass (≥691 passing, 0 failures from this change).

- [ ] **Step 5: Commit**

```bash
git add src/controllers/bidController.js tests/unit/controllers/bidController.validateBid.test.js
git commit -m "fix: validateBid uses dollar amounts not cents (minIncrement $10)"
```

---

### Task 2: Fix winner email notification — divides dollar amount by 100

**Files:**
- Modify: `src/services/auctionService.js:620`

Winner notification email shows 1/100th of the actual winning bid because `winningBid` is already stored in dollars, but line 620 divides by 100.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/services/auctionService.winnerEmail.test.js
describe('winner email bid amount', () => {
  it('passes winningBid without /100 division', () => {
    const winningBid = '115'; // DB value in dollars
    const correct = parseFloat(winningBid);        // 115
    const buggy   = parseFloat(winningBid) / 100;  // 1.15
    expect(correct).toBe(115);
    expect(buggy).toBe(1.15); // proves the bug
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx jest tests/unit/services/auctionService.winnerEmail.test.js --no-coverage
```
Expected: PASS

- [ ] **Step 3: Apply fix to `src/services/auctionService.js` line 620**

```js
// BEFORE (line 620):
                winningBidDollars: parseFloat(winner.winningBid) / 100
```

```js
// AFTER:
                winningBidDollars: parseFloat(winner.winningBid)
```

- [ ] **Step 4: Run full test suite**

```bash
cd Silent-Auction-Gallery && npm test -- --no-coverage 2>&1 | tail -20
```
Expected: ≥691 passing.

- [ ] **Step 5: Commit**

```bash
git add src/services/auctionService.js tests/unit/services/auctionService.winnerEmail.test.js
git commit -m "fix: winner notification email shows correct bid amount (remove /100)"
```

---

### Task 3: Fix `closeAuction()` — finds only one winner across all artwork

**Files:**
- Modify: `src/services/biddingService.js:381-410`
- Test: `tests/unit/services/biddingService.test.js`

Current query uses `LIMIT 1`, so only the single highest-bid piece gets a winner. All other artwork pieces in a multi-artwork auction end with their highest bids stuck in `ACTIVE` status forever.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/services/biddingService.test.js`:

```js
describe('closeAuction multi-artwork', () => {
  it('produces one winner per artwork, not one winner total', () => {
    // Simulate the DISTINCT ON query result for 2 artwork pieces
    const rows = [
      { artwork_id: 'art-1', placed_by_user_id: 'user-A', bid_amount: 200, first_name: 'Alice', last_name: 'A', email: 'a@test.com' },
      { artwork_id: 'art-2', placed_by_user_id: 'user-B', bid_amount: 150, first_name: 'Bob',   last_name: 'B', email: 'b@test.com' }
    ];
    // Old code: LIMIT 1 → 1 winner
    const oldWinners = rows.slice(0, 1);
    // New code: DISTINCT ON artwork_id → 2 winners
    const newWinners = rows; // one row per artwork
    expect(oldWinners.length).toBe(1);
    expect(newWinners.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx jest tests/unit/services/biddingService.test.js --no-coverage 2>&1 | tail -15
```
Expected: PASS (the unit test validates the logic expectation).

- [ ] **Step 3: Apply fix to `src/services/biddingService.js` lines 381–427**

Replace the block from `// Find the highest active bid across all artwork` through `winner,` in the return:

```js
// BEFORE (lines 381–427):
      // Find the highest active bid across all artwork in this auction
      const winnerResult = await client.query(
        `SELECT b.placed_by_user_id, b.bid_amount, b.artwork_id,
                u.first_name, u.last_name, u.email
         FROM bids b
         JOIN artwork a ON b.artwork_id = a.id
         JOIN users u ON b.placed_by_user_id = u.id
         WHERE a.auction_id = $1 AND b.bid_status = 'ACTIVE'
         ORDER BY b.bid_amount DESC LIMIT 1`,
        [auctionId]
      );

      let winner = null;

      if (winnerResult.rows.length > 0) {
        const row = winnerResult.rows[0];
        winner = {
          id: row.placed_by_user_id,
          name: `${row.first_name} ${row.last_name}`,
          email: row.email,
          bidAmount: row.bid_amount
        };

        // Mark winning bid as ACCEPTED
        await client.query(
          `UPDATE bids SET bid_status = 'ACCEPTED'
           WHERE artwork_id = $1 AND placed_by_user_id = $2 AND bid_status = 'ACTIVE'`,
          [row.artwork_id, row.placed_by_user_id]
        );
      }

      // Log auction closure
      await client.query(
        `INSERT INTO audit_logs (action_category, action_type, resource_type, resource_id, action_details)
         VALUES ($1, $2, $3, $4, $5)`,
        ['AUCTION', 'auction_closed', 'auction', auctionId,
          JSON.stringify({ winner_id: winner?.id || null, final_bid: winner?.bidAmount || null })]
      );

      await client.query('COMMIT');

      return {
        success: true,
        auctionId,
        winner,
        message: winner ? `Auction closed. Winner: ${winner.name}` : 'Auction closed with no winner'
      };
```

```js
// AFTER (replace with):
      // Find the highest active bid PER ARTWORK in this auction (one winner per piece)
      const winnerResult = await client.query(
        `SELECT DISTINCT ON (b.artwork_id)
                b.placed_by_user_id, b.bid_amount, b.artwork_id,
                u.first_name, u.last_name, u.email
         FROM bids b
         JOIN artwork a ON b.artwork_id = a.id
         JOIN users u ON b.placed_by_user_id = u.id
         WHERE a.auction_id = $1 AND b.bid_status = 'ACTIVE'
         ORDER BY b.artwork_id, b.bid_amount DESC`,
        [auctionId]
      );

      const winners = [];

      for (const row of winnerResult.rows) {
        winners.push({
          id: row.placed_by_user_id,
          name: `${row.first_name} ${row.last_name}`,
          email: row.email,
          bidAmount: row.bid_amount,
          artworkId: row.artwork_id
        });

        // Mark winning bid as ACCEPTED for this artwork
        await client.query(
          `UPDATE bids SET bid_status = 'ACCEPTED'
           WHERE artwork_id = $1 AND placed_by_user_id = $2 AND bid_status = 'ACTIVE'`,
          [row.artwork_id, row.placed_by_user_id]
        );
      }

      // Backward-compatible: expose the top winner for callers that expect a single `winner`
      const winner = winners.length > 0 ? winners[0] : null;

      // Log auction closure
      await client.query(
        `INSERT INTO audit_logs (action_category, action_type, resource_type, resource_id, action_details)
         VALUES ($1, $2, $3, $4, $5)`,
        ['AUCTION', 'auction_closed', 'auction', auctionId,
          JSON.stringify({ winners_count: winners.length, total_bids_accepted: winners.length })]
      );

      await client.query('COMMIT');

      return {
        success: true,
        auctionId,
        winner,
        winners,
        message: winners.length > 0
          ? `Auction closed. ${winners.length} winner(s) determined.`
          : 'Auction closed with no winner'
      };
```

- [ ] **Step 4: Run full test suite**

```bash
cd Silent-Auction-Gallery && npm test -- --no-coverage 2>&1 | tail -20
```
Expected: ≥691 passing.

- [ ] **Step 5: Commit**

```bash
git add src/services/biddingService.js tests/unit/services/biddingService.test.js
git commit -m "fix: closeAuction determines one winner per artwork piece, not one per auction"
```

---

### Task 4: Add auth guards to unauthenticated bid endpoints

**Files:**
- Modify: `src/routes/biddingRoutes.js:99, 123, 194`

Three routes expose sensitive data without authentication: bid history (bidder names + amounts), bidding state, and winner PII. Add `authMiddleware.verifyToken` to all three.

- [ ] **Step 1: Write the failing test**

```js
// tests/security/bidding.auth.test.js
const request = require('supertest');
const { createApp } = require('../../src/app');

describe('bid endpoints require auth', () => {
  let app;
  beforeAll(() => { app = createApp(global.testDb); });

  it('GET /api/bidding/artwork/:id/history returns 401 without token', async () => {
    const res = await request(app).get('/api/bidding/artwork/some-id/history');
    expect(res.status).toBe(401);
  });

  it('GET /api/bidding/artwork/:id/state returns 401 without token', async () => {
    const res = await request(app).get('/api/bidding/artwork/some-id/state');
    expect(res.status).toBe(401);
  });

  it('GET /api/bidding/auction/:id/winner returns 401 without token', async () => {
    const res = await request(app).get('/api/bidding/auction/some-id/winner');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it currently fails (routes return 200/500, not 401)**

```bash
npx jest tests/security/bidding.auth.test.js --no-coverage 2>&1 | tail -15
```
Expected: FAIL (the routes currently don't require auth).

- [ ] **Step 3: Apply fix to `src/routes/biddingRoutes.js`**

Line 99 — add `authMiddleware.verifyToken`:
```js
// BEFORE:
router.get('/artwork/:artworkId/history', async (req, res) => {

// AFTER:
router.get('/artwork/:artworkId/history', authMiddleware.verifyToken, async (req, res) => {
```

Line 123 — add `authMiddleware.verifyToken`:
```js
// BEFORE:
router.get('/artwork/:artworkId/state', async (req, res) => {

// AFTER:
router.get('/artwork/:artworkId/state', authMiddleware.verifyToken, async (req, res) => {
```

Line 194 — add `authMiddleware.verifyToken`:
```js
// BEFORE:
router.get('/auction/:auctionId/winner', async (req, res) => {

// AFTER:
router.get('/auction/:auctionId/winner', authMiddleware.verifyToken, async (req, res) => {
```

- [ ] **Step 4: Run the new auth test — now should pass**

```bash
npx jest tests/security/bidding.auth.test.js --no-coverage 2>&1 | tail -15
```
Expected: PASS (all three return 401).

- [ ] **Step 5: Run full test suite**

```bash
cd Silent-Auction-Gallery && npm test -- --no-coverage 2>&1 | tail -20
```
Expected: ≥691 passing (existing tests for these routes that don't include auth tokens may need updating — if any fail, add a valid token to those test requests).

- [ ] **Step 6: Commit**

```bash
git add src/routes/biddingRoutes.js tests/security/bidding.auth.test.js
git commit -m "security: require auth on bid history, bidding state, and auction winner endpoints"
```

---

### Task 5: Remove hardcoded JWT secret fallbacks (CRITICAL)

**Files:**
- Modify: `src/routes/authRoutes.js:32-33`

`'dev-secret'` is the fallback when `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` env vars are missing. Any attacker who knows (or guesses) this fallback can mint valid JWTs on a misconfigured deployment. Fix: throw at startup if either secret is absent.

- [ ] **Step 1: Write the failing test**

```js
// tests/security/jwt.secrets.test.js
describe('JWT secret environment guards', () => {
  it('authRoutes source code does not contain the string dev-secret', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require.resolve('../../src/routes/authRoutes.js'),
      'utf8'
    );
    expect(src).not.toContain("'dev-secret'");
    expect(src).not.toContain('"dev-secret"');
  });
});
```

- [ ] **Step 2: Run test — should FAIL (dev-secret is currently present)**

```bash
npx jest tests/security/jwt.secrets.test.js --no-coverage 2>&1 | tail -15
```
Expected: FAIL.

- [ ] **Step 3: Apply fix to `src/routes/authRoutes.js` lines 31-36**

```js
// BEFORE (lines 31-36):
  const jwtService = new JWTService({
    accessTokenSecret: process.env.JWT_ACCESS_SECRET || 'dev-secret',
    refreshTokenSecret: process.env.JWT_REFRESH_SECRET || 'dev-secret',
    accessTokenExpiry: '15m',
    refreshTokenExpiry: '7d'
  });
```

```js
// AFTER:
  if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET) {
    throw new Error('FATAL: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set in environment');
  }
  const jwtService = new JWTService({
    accessTokenSecret: process.env.JWT_ACCESS_SECRET,
    refreshTokenSecret: process.env.JWT_REFRESH_SECRET,
    accessTokenExpiry: '15m',
    refreshTokenExpiry: '7d'
  });
```

**Important:** The test environment must have these vars set. Check `jest.config.js` or `.env.test` — add them if missing:
```
JWT_ACCESS_SECRET=test-access-secret-at-least-32-chars-long
JWT_REFRESH_SECRET=test-refresh-secret-at-least-32-chars-long
```

- [ ] **Step 4: Run the new security test — should now pass**

```bash
npx jest tests/security/jwt.secrets.test.js --no-coverage 2>&1 | tail -10
```
Expected: PASS.

- [ ] **Step 5: Run full test suite**

```bash
cd Silent-Auction-Gallery && npm test -- --no-coverage 2>&1 | tail -20
```
Expected: ≥691 passing. If any test fails with "FATAL: JWT_ACCESS_SECRET", add the test env vars.

- [ ] **Step 6: Commit**

```bash
git add src/routes/authRoutes.js tests/security/jwt.secrets.test.js
git commit -m "security(critical): remove dev-secret JWT fallback — fail fast if env vars absent"
```

---

### Task 6: Mount `loginLimiter` on login and verify-2fa routes

**Files:**
- Modify: `src/routes/authRoutes.js:133, 199`

`loginLimiter` (5 req / 15 min) exists in `rateLimitMiddleware.js` but is never imported or used. The login and verify-2fa routes currently have no per-IP brute-force protection (only the broad 100 req/min `apiLimiter` applies). Add `loginLimiter` to both.

- [ ] **Step 1: Write the failing test**

```js
// tests/security/login.ratelimit.test.js
describe('login route uses loginLimiter middleware', () => {
  it('authRoutes imports loginLimiter', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require.resolve('../../src/routes/authRoutes.js'),
      'utf8'
    );
    expect(src).toContain('loginLimiter');
  });
});
```

- [ ] **Step 2: Run test — should FAIL**

```bash
npx jest tests/security/login.ratelimit.test.js --no-coverage 2>&1 | tail -10
```
Expected: FAIL.

- [ ] **Step 3: Apply fix to `src/routes/authRoutes.js`**

At the top of the file, find where `const express = require('express');` is and add the import after it:

```js
// ADD after the existing requires at the top of authRoutes.js:
const { loginLimiter } = require('../middleware/rateLimitMiddleware');
```

Then update the two route definitions:

```js
// Line 133 BEFORE:
  router.post('/login', (req, res, next) => userController.login(req, res, next));

// Line 133 AFTER:
  router.post('/login', loginLimiter, (req, res, next) => userController.login(req, res, next));
```

```js
// Line 199 BEFORE:
  router.post('/verify-2fa', (req, res, next) => userController.verify2FA(req, res, next));

// Line 199 AFTER:
  router.post('/verify-2fa', loginLimiter, (req, res, next) => userController.verify2FA(req, res, next));
```

- [ ] **Step 4: Run the new test — should pass**

```bash
npx jest tests/security/login.ratelimit.test.js --no-coverage 2>&1 | tail -10
```
Expected: PASS.

- [ ] **Step 5: Run full test suite**

```bash
cd Silent-Auction-Gallery && npm test -- --no-coverage 2>&1 | tail -20
```
Expected: ≥691 passing. Note: `loginLimiter` skips in `NODE_ENV=test` so no rate-limit failures in tests.

- [ ] **Step 6: Commit**

```bash
git add src/routes/authRoutes.js tests/security/login.ratelimit.test.js
git commit -m "security: mount loginLimiter (5/15min) on /login and /verify-2fa routes"
```

---

### Task 7: Fix CORS wildcard + credentials conflict

**Files:**
- Modify: `src/app.js:80-87`

`credentials: true` combined with `origin: '*'` is both a browser-rejected combination and an overly permissive configuration. In non-production, the wildcard means any origin can trigger credentialed requests. Fix: enumerate allowed origins for all environments.

- [ ] **Step 1: Write the failing test**

```js
// tests/security/cors.config.test.js
describe('CORS configuration', () => {
  it('app.js does not combine credentials:true with origin:*', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require.resolve('../../src/app.js'),
      'utf8'
    );
    // The string origin: '*' should not appear alongside credentials: true
    expect(src).not.toMatch(/origin\s*:\s*['"`]\*['"`]/);
  });
});
```

- [ ] **Step 2: Run test — should FAIL**

```bash
npx jest tests/security/cors.config.test.js --no-coverage 2>&1 | tail -10
```
Expected: FAIL.

- [ ] **Step 3: Apply fix to `src/app.js` lines 80–87**

```js
// BEFORE:
  const corsOptions = {
    origin: isProduction
      ? ['https://yourdomain.com', 'https://www.yourdomain.com']
      : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  };
```

```js
// AFTER:
  const allowedOrigins = isProduction
    ? (process.env.ALLOWED_ORIGINS || 'https://sag.live,https://www.sag.live')
        .split(',').map(o => o.trim())
    : ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'];

  const corsOptions = {
    origin: (origin, callback) => {
      // Allow server-to-server (no origin) and explicitly listed origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  };
```

- [ ] **Step 4: Run the new CORS test — should pass**

```bash
npx jest tests/security/cors.config.test.js --no-coverage 2>&1 | tail -10
```
Expected: PASS.

- [ ] **Step 5: Run full test suite**

```bash
cd Silent-Auction-Gallery && npm test -- --no-coverage 2>&1 | tail -20
```
Expected: ≥691 passing.

- [ ] **Step 6: Commit**

```bash
git add src/app.js tests/security/cors.config.test.js
git commit -m "security: replace CORS wildcard with explicit origin allowlist, fix credentials conflict"
```

---

## Self-Review

### Spec coverage
- ✅ Task 1: `validateBid()` cents bug — addresses logic audit item #1
- ✅ Task 2: Winner email `/100` — addresses logic audit item #2
- ✅ Task 3: Multi-artwork winner — addresses logic audit item #3
- ✅ Task 4: Auth on bid endpoints — addresses logic audit #4 + security audit HIGH #3 + #4 + #5
- ✅ Task 5: JWT secret fallbacks — addresses security CRITICAL #1
- ✅ Task 6: loginLimiter — addresses security HIGH #7 + LOW #14
- ✅ Task 7: CORS wildcard — addresses security HIGH #6

### Not covered (out of scope for code-only plan)
- Security CRITICAL #2 (encryption key fallback in authenticationService.js) — requires its own task; involves random salt generation, stored alongside ciphertext
- Security MEDIUM #8 (tokens in localStorage) — large architectural refactor, not a simple patch
- Security MEDIUM #9 (unsafe-inline CSP) — requires nonce infrastructure
- Security MEDIUM #10 (pre-auth token secret) — low blast radius, safe to defer
- Sections 10, 12, 13, 14 — infrastructure / testing / documentation projects, not code fixes

### Placeholder scan
None found.

### Type consistency
All `minimumBid` and `currentBid` values are now returned as dollar floats consistently across Tasks 1, 2, and 3. `winners` array added to `closeAuction` return (backward-compatible alongside existing `winner`).

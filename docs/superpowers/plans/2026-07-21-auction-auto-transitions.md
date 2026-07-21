# Auction Auto-Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Auctions transition on schedule without manual API calls — APPROVED → LIVE at `starts_at`, LIVE → ENDED (full finalization: winners, fees, emails) at `ends_at` — plus fix the invalid winning-bid SQL that makes ending any auction with bids fail.

**Architecture:** New `src/services/auctionScheduler.js` running an in-process 60-second sweep (started once from `src/index.js`, skipped under test). Auto-start is one guarded UPDATE; auto-end reuses `auctionService.endAuction` per due auction. No new dependencies.

**Tech Stack:** Node/Express, PostgreSQL via `pool`, Jest (module-mocked pool), CommonJS.

**Spec:** `docs/superpowers/specs/2026-07-21-auction-auto-transitions-design.md`.

## Global Constraints
- Sweep must never crash the process: wrap `sweep()` body per-phase in try/catch, log with `console.error('[auction-scheduler] ...')`; a per-auction `endAuction` failure must not stop remaining auctions.
- Timer: `setInterval(...).unref()`; `start()` idempotent (no double timers); `stop()` for tests.
- `src/index.js` must NOT start the scheduler when `NODE_ENV === 'test'`.
- Audit rows use existing CHECK-valid category `'AUCTION'` (literal strings — security-lint).
- Auto-start conditions exactly: `auction_status='APPROVED' AND starts_at <= NOW() AND ends_at > NOW() AND deleted_at IS NULL`.
- Winning-bid tie-break: `ORDER BY bid_amount DESC, placed_at ASC` (`bids.placed_at` exists, schema.sql:329).
- Baseline: **942 tests**, ESLint 0 errors. Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Do NOT push (user approval required).

## File Structure
- `src/services/auctionService.js` — MODIFY: fix winning-bid UPDATE (line ~567).
- `src/services/auctionScheduler.js` — CREATE: `sweep`, `start`, `stop`.
- `src/index.js` — MODIFY: start scheduler after DB init (non-test).
- Tests: `tests/unit/services/auctionScheduler.test.js` (CREATE), `tests/unit/services/auctionService.endAuction.test.js` (CREATE).

---

## Task 1: Fix the winning-bid UPDATE in `endAuction`

**Files:** Modify `src/services/auctionService.js:566-572`; Create `tests/unit/services/auctionService.endAuction.test.js`.

- [ ] **Step 1: Write the failing test** `tests/unit/services/auctionService.endAuction.test.js`:
```js
'use strict';
jest.mock('../../../src/models/index', () => ({
  pool: { connect: jest.fn(), query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }
}));
jest.mock('../../../src/services/notificationService', () => ({
  getSharedEmailProvider: jest.fn(() => ({ send: jest.fn() })),
  notifyAuctionWon: jest.fn().mockResolvedValue(undefined)
}));

const { pool } = require('../../../src/models/index');
const auctionService = require('../../../src/services/auctionService');

describe('endAuction winning-bid update', () => {
  test('marks the winner via a valid subselect (no UPDATE ... ORDER BY)', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    client.query.mockImplementation((sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') { return Promise.resolve({}); }
      if (/FROM auctions a/.test(sql)) {
        return Promise.resolve({ rows: [{ id: 'auc-1', auction_status: 'LIVE', platform_fee_percentage: 10, artwork_count: 1 }] });
      }
      if (/FROM artwork a/.test(sql)) {
        return Promise.resolve({ rows: [{ id: 'art-1', title: 'Sunset', winner_id: 'user-9', winning_bid: '50.00' }] });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    const result = await auctionService.endAuction('auc-1');
    expect(result.success).toBe(true);
    expect(result.winnersCount).toBe(1);

    // Flush the post-commit setImmediate winner-email block so any rejection
    // surfaces here (user lookup returns empty rows → path exits via continue).
    await new Promise((resolve) => setImmediate(resolve));

    const updateBids = client.query.mock.calls.find(c => typeof c[0] === 'string' && c[0].includes('UPDATE bids'));
    expect(updateBids).toBeTruthy();
    // Valid Postgres: UPDATE has no ORDER BY/LIMIT — the winner must be picked in a subselect.
    expect(updateBids[0]).toContain('(SELECT id FROM bids');
    expect(updateBids[0]).toContain('ORDER BY bid_amount DESC, placed_at ASC');
    expect(updateBids[1]).toEqual(['art-1']); // old broken code passed [piece.id, piece.winner_id]
  });

  test('endAuction refuses a non-LIVE auction (cannot resurrect CANCELLED/APPROVED)', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    client.query.mockImplementation((sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') { return Promise.resolve({}); }
      if (/FROM auctions a/.test(sql)) {
        return Promise.resolve({ rows: [{ id: 'auc-2', auction_status: 'CANCELLED', artwork_count: 0 }] });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const result = await auctionService.endAuction('auc-2');
    expect(result.success).toBe(false);
    const updates = client.query.mock.calls.filter(c => typeof c[0] === 'string' && c[0].includes('UPDATE auctions'));
    expect(updates).toHaveLength(0);
  });
});
```
- [ ] **Step 2: Run → FAIL** (current SQL has params `[piece.id, piece.winner_id]` and no subselect; with a real DB it would be a syntax error).
- [ ] **Step 3: Fix `src/services/auctionService.js`** — three changes in `endAuction` (per plan review):

**(a) LIVE-only guard** — replace the ENDED-only early return (~line 533):
```js
      if (auction.auction_status === 'ENDED') {
        return {
          success: false,
          message: 'Auction is already ended'
        };
      }
```
with:
```js
      if (auction.auction_status !== 'LIVE') {
        return {
          success: false,
          message: auction.auction_status === 'ENDED'
            ? 'Auction is already ended'
            : `Only LIVE auctions can be ended (status: ${auction.auction_status})`
        };
      }
```
(The early return path must still COMMIT/release as the current code path does — keep the surrounding structure.)

**(b) Tie-break alignment** — in the artwork query (~line 542-548), add `, placed_at ASC` to BOTH subqueries so the reported winner and the ACCEPTED bid can never disagree on tied amounts:
```js
        `SELECT a.id, a.title,
                (SELECT placed_by_user_id FROM bids WHERE artwork_id = a.id AND bid_status = 'ACTIVE' ORDER BY bid_amount DESC, placed_at ASC LIMIT 1) as winner_id,
                (SELECT bid_amount FROM bids WHERE artwork_id = a.id AND bid_status = 'ACTIVE' ORDER BY bid_amount DESC, placed_at ASC LIMIT 1) as winning_bid
         FROM artwork a
         WHERE a.auction_id = $1`,
```

**(c) The invalid UPDATE** — replace:
```js
          // Mark winning bid as ACCEPTED, others as CANCELLED
          await client.query(
            `UPDATE bids SET bid_status = 'ACCEPTED'
             WHERE artwork_id = $1 AND placed_by_user_id = $2 AND bid_status = 'ACTIVE'
             ORDER BY bid_amount DESC LIMIT 1`,
            [piece.id, piece.winner_id]
          );
```
with:
```js
          // Mark the single winning bid ACCEPTED (highest amount, earliest placed on tie).
          // NOTE: UPDATE has no ORDER BY/LIMIT in Postgres — pick the row in a subselect.
          await client.query(
            `UPDATE bids SET bid_status = 'ACCEPTED'
             WHERE id = (SELECT id FROM bids
                          WHERE artwork_id = $1 AND bid_status = 'ACTIVE'
                          ORDER BY bid_amount DESC, placed_at ASC
                          LIMIT 1)`,
            [piece.id]
          );
```
- [ ] **Step 4: Run test → PASS; full `npx jest` → green; `npx eslint .` → 0 errors.**
- [ ] **Step 5: Commit** `fix(auction): winning-bid update used invalid UPDATE...ORDER BY — ending auctions with bids always failed`.

---

## Task 2: `auctionScheduler` service

**Files:** Create `src/services/auctionScheduler.js`; Create `tests/unit/services/auctionScheduler.test.js`.

**Interfaces — Produces:** `{ sweep, start, stop }`. `sweep()` → `Promise<{started:number, ended:number}>`.

- [ ] **Step 1: Write failing tests** `tests/unit/services/auctionScheduler.test.js`:
```js
'use strict';
jest.mock('../../../src/models/index', () => ({
  pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }
}));
jest.mock('../../../src/services/auctionService', () => ({
  endAuction: jest.fn().mockResolvedValue({ success: true })
}));

const { pool } = require('../../../src/models/index');
const auctionService = require('../../../src/services/auctionService');
const scheduler = require('../../../src/services/auctionScheduler');

beforeEach(() => {
  pool.query.mockReset();
  pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
  auctionService.endAuction.mockClear();
  scheduler.stop();
});
afterAll(() => scheduler.stop());

describe('auctionScheduler.sweep', () => {
  test('promotes due APPROVED auctions to LIVE and audits each', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'a1' }, { id: 'a2' }], rowCount: 2 }) // auto-start UPDATE
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })                            // audit a1
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })                            // audit a2
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });                           // due-LIVE select
    const out = await scheduler.sweep();
    expect(out.started).toBe(2);
    // Normalize whitespace so SQL reformatting can't silently break the test.
    const startSql = pool.query.mock.calls[0][0].replace(/\s+/g, ' ');
    expect(startSql).toContain("auction_status = 'APPROVED'");
    expect(startSql).toContain('starts_at <= NOW()');
    expect(startSql).toContain('ends_at > NOW()');
    expect(startSql).toContain('deleted_at IS NULL');
    const auditSql = pool.query.mock.calls[1][0];
    expect(auditSql).toContain('INSERT INTO audit_logs');
    expect(pool.query.mock.calls[1][1]).toEqual(expect.arrayContaining(['AUCTION', 'auction_auto_started', 'a1']));
  });

  test('ends every due LIVE auction via auctionService.endAuction', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                          // auto-start
      .mockResolvedValueOnce({ rows: [{ id: 'L1' }, { id: 'L2' }], rowCount: 2 }); // due-LIVE select
    const out = await scheduler.sweep();
    expect(out.ended).toBe(2);
    expect(auctionService.endAuction).toHaveBeenCalledWith('L1');
    expect(auctionService.endAuction).toHaveBeenCalledWith('L2');
    const dueSql = pool.query.mock.calls[1][0];
    expect(dueSql).toContain("auction_status = 'LIVE'");
    expect(dueSql).toContain('ends_at <= NOW()');
  });

  test('one failing endAuction does not stop the rest', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'L1' }, { id: 'L2' }], rowCount: 2 });
    auctionService.endAuction
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ success: true });
    const out = await scheduler.sweep();
    expect(out.ended).toBe(1);
    expect(auctionService.endAuction).toHaveBeenCalledTimes(2);
  });

  test('nothing due → no endAuction calls, zero counts', async () => {
    const out = await scheduler.sweep();
    expect(out).toEqual({ started: 0, ended: 0 });
    expect(auctionService.endAuction).not.toHaveBeenCalled();
  });

  test('start() is idempotent and stop() clears the timer', () => {
    // Real timers (the real timer object has unref); assert via spies.
    const setSpy = jest.spyOn(global, 'setInterval');
    const clearSpy = jest.spyOn(global, 'clearInterval');
    scheduler.start(60000);
    scheduler.start(60000); // second call must be a no-op
    expect(setSpy).toHaveBeenCalledTimes(1);
    scheduler.stop();
    scheduler.stop(); // second stop must be a no-op
    expect(clearSpy).toHaveBeenCalledTimes(1);
    setSpy.mockRestore();
    clearSpy.mockRestore();
  });
});
```
- [ ] **Step 2: Run → FAIL** (module missing).
- [ ] **Step 3: Create `src/services/auctionScheduler.js`:**
```js
'use strict';
/**
 * Auction scheduler — in-process sweep that makes scheduled transitions happen:
 *   APPROVED → LIVE  when starts_at arrives (never DRAFT/PENDING_APPROVAL;
 *                     a fully expired APPROVED auction stays APPROVED)
 *   LIVE     → ENDED when ends_at passes (full finalization via endAuction:
 *                     winners, fees, audit, winner emails)
 * Auto-extend safe: every sweep reads the CURRENT ends_at. Restart safe: the
 * sweep is stateless. Double-run safe: endAuction row-locks and no-ops on ENDED.
 */
const { pool } = require('../models/index');
const auctionService = require('./auctionService');

let _timer = null;

async function _autoStart() {
  const due = await pool.query(
    `UPDATE auctions
        SET auction_status = 'LIVE', published_at = NOW(), updated_at = CURRENT_TIMESTAMP
      WHERE auction_status = 'APPROVED'
        AND starts_at <= NOW()
        AND ends_at   >  NOW()
        AND deleted_at IS NULL
      RETURNING id`
  );
  for (const row of due.rows) {
    try {
      await pool.query(
        `INSERT INTO audit_logs (action_category, action_type, resource_type, resource_id, action_details)
         VALUES ($1, $2, $3, $4, $5)`,
        ['AUCTION', 'auction_auto_started', 'auction', row.id, JSON.stringify({ by: 'scheduler' })]
      );
    } catch (err) {
      console.error('[auction-scheduler] audit failed for auto-start %s: %s', row.id, err.message);
    }
  }
  return due.rows.length;
}

async function _autoEnd() {
  const due = await pool.query(
    `SELECT id FROM auctions
      WHERE auction_status = 'LIVE' AND ends_at <= NOW() AND deleted_at IS NULL`
  );
  let ended = 0;
  for (const row of due.rows) {
    try {
      await auctionService.endAuction(row.id);
      ended++;
    } catch (err) {
      console.error('[auction-scheduler] endAuction failed for %s: %s', row.id, err.message);
    }
  }
  return ended;
}

async function sweep() {
  let started = 0;
  let ended = 0;
  try { started = await _autoStart(); }
  catch (err) { console.error('[auction-scheduler] auto-start sweep failed: %s', err.message); }
  try { ended = await _autoEnd(); }
  catch (err) { console.error('[auction-scheduler] auto-end sweep failed: %s', err.message); }
  return { started, ended };
}

function start(intervalMs = 60000) {
  if (_timer) { return; }
  _timer = setInterval(() => { sweep(); }, intervalMs);
  _timer.unref(); // never hold the process open
  sweep(); // catch up immediately on boot
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { sweep, start, stop };
```
- [ ] **Step 4: Run tests → PASS (5); full suite green; lint 0 errors.**
- [ ] **Step 5: Commit** `feat(auction): scheduler sweep — auto-start at starts_at, auto-end (finalize) at ends_at`.

---

## Task 3: Wire the scheduler into server startup

**Files:** Modify `src/index.js` (after the gallery-comments DDL block, still inside the db-available branch, before `createApp(db)`).

- [ ] **Step 1: Add** (next to the other post-DDL setup in `src/index.js`, ~line 269):
```js
      // Scheduled auction transitions (auto-start / auto-end). Not in tests.
      if (process.env.NODE_ENV !== 'test') {
        const auctionScheduler = require('./services/auctionScheduler');
        auctionScheduler.start();
        console.log('✅ Auction scheduler running (60s sweep)');
      }
```
- [ ] **Step 2: Full `npx jest` → green (no open-handle warnings beyond baseline — timer is unref'd and not started under test); `npx eslint .` → 0 errors.**
- [ ] **Step 3: Commit** `feat(auction): start scheduler sweep on boot`.

---

## Self-review (plan vs spec)
- Bug fix subselect + `placed_at` tie-break → Task 1. ✅
- Sweep unit with start/stop/unref/idempotent start, per-phase and per-auction error isolation → Task 2. ✅
- Auto-start guarded exactly per spec (APPROVED only, window still open) + `auction_auto_started` audit → Task 2. ✅
- Auto-end reuses `endAuction` (idempotent, FOR UPDATE) → Task 2. ✅
- index.js wiring, test-env skip → Task 3. ✅
- Out of scope respected: no websockets, no bid cancellation changes, no leader election. ✅

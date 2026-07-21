# Auction Auto-Transitions (auto-start + auto-end) — Design Spec

**Date:** 2026-07-21  **Status:** Approved design (user confirmed auto-start AND auto-end).

## Problem
Auctions have scheduled `starts_at` / `ends_at`, but transitions are manual API actions only:
- An APPROVED auction goes LIVE only when someone clicks publish.
- A LIVE auction stays LIVE in the DB forever after `ends_at` passes unless someone calls the end
  endpoint. Downstream guards are time-aware (bidding rejects by `ends_at`; detail page + carousel
  now derive Ended from `endTime`), but the DB status, list filters, and finalization (winners,
  emails, fees) never happen on their own.
- **Latent bug:** `auctionService.endAuction` marks the winning bid with
  `UPDATE bids ... ORDER BY bid_amount DESC LIMIT 1` — invalid PostgreSQL (UPDATE has no
  ORDER BY/LIMIT). Any auction ending with ≥1 active bid throws `syntax error at or near "ORDER"`
  and rolls back, so even MANUAL ending fails for auctions with bids. This is very likely why live
  auctions have never transitioned to ENDED.

## Decision
**In-process periodic sweep** (no new dependencies, single-process VPS deployment):

- New unit `src/services/auctionScheduler.js`:
  - `sweep()` — runs both transitions; exported for tests.
  - `start(intervalMs = 60000)` — `setInterval(sweep)` + one immediate sweep; idempotent; the
    timer is `unref()`ed so it never holds the process open.
  - `stop()` — clears the timer.
- Wiring: `src/index.js` calls `start()` once after DB init, **skipped when `NODE_ENV === 'test'`**.
- A sweep failure is caught + logged (`console.error`) and never crashes the server; the next tick
  retries. Per-auction failures inside a sweep don't block other auctions.

### Auto-start (APPROVED → LIVE)
Single statement, per-row audit after:
```sql
UPDATE auctions
   SET auction_status = 'LIVE', published_at = NOW(), updated_at = CURRENT_TIMESTAMP
 WHERE auction_status = 'APPROVED'
   AND starts_at <= NOW()
   AND ends_at   >  NOW()
   AND deleted_at IS NULL
 RETURNING id
```
- Never touches DRAFT / PENDING_APPROVAL.
- An APPROVED auction whose whole window already passed stays APPROVED (never LIVE for 0 seconds).
- Audit per row: category `AUCTION`, action `auction_auto_started`.
- Manual publish still works (go live before `starts_at`).

### Auto-end (LIVE → ENDED, full finalization)
```sql
SELECT id FROM auctions
 WHERE auction_status = 'LIVE' AND ends_at <= NOW() AND deleted_at IS NULL
```
then for each id call the existing `auctionService.endAuction(id)` — winner determination, bid
ACCEPTED, platform fee, `auction_ended` audit, winner emails, exactly as manual end.
- Idempotent/concurrent-safe: `endAuction` locks the row (`FOR UPDATE`) and returns early if
  already ENDED.
- Auto-extend-safe: each sweep reads the **current** `ends_at`; an extended auction simply isn't
  selected until its new end passes.

### Prerequisite bug fix (in `endAuction`)
Replace the invalid winning-bid UPDATE with a subselect:
```sql
UPDATE bids SET bid_status = 'ACCEPTED'
 WHERE id = (SELECT id FROM bids
              WHERE artwork_id = $1 AND bid_status = 'ACTIVE'
              ORDER BY bid_amount DESC, created_at ASC
              LIMIT 1)
```
(highest bid wins; earliest-placed bid breaks ties — verify the bids timestamp column name during
implementation and use it).

## Out of scope (YAGNI)
- WebSocket broadcast of transitions (pages already derive state from `endTime`; bidding is
  server-guarded by time).
- Cancelling non-winning bids (existing behavior untouched).
- Multi-process leader election (single VPS process; row locks make double-runs harmless anyway).
- Auto-transition of expired APPROVED auctions to ENDED.

## Testing
- Unit (mocked pool): sweep promotes due APPROVED rows (asserts UPDATE conditions + audit insert);
  sweep ends due LIVE rows (asserts `endAuction` called per id); nothing due → no writes; a
  throwing `endAuction` for one auction doesn't stop the others; `start()` under
  `NODE_ENV === 'test'` is never wired by index.js.
- Regression: winning-bid update uses the subselect form (no `UPDATE ... ORDER BY`); with a mocked
  winner row the UPDATE receives the artwork id + runs without the invalid clause.
- Live QA after deploy: watch a short test auction start and end on schedule; winner email arrives.

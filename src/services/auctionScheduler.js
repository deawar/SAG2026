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

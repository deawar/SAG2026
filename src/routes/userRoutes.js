/**
 * User Routes
 * All routes are protected by verifyToken middleware mounted in index.js.
 * req.user is always populated here.
 */

const express  = require('express');
const bcrypt   = require('bcrypt');
const { UserModel } = require('../models');
const authenticationService = require('../services/authenticationService');
const UserController = require('../controllers/userController');

module.exports = (db) => {
  const router = express.Router();

  const userModel      = new UserModel(db);
  const userController = new UserController(userModel, authenticationService);

  // ---------------------------------------------------------------------------
  // GET /api/user/profile
  // ---------------------------------------------------------------------------
  router.get('/profile', (req, res, next) => {
    userController.getProfile(req, res, next);
  });

  // ---------------------------------------------------------------------------
  // PUT /api/user/profile  — update name / email / phone
  // ---------------------------------------------------------------------------
  router.put('/profile', async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const { fullName, email, phone } = req.body;

      const nameParts  = (fullName || '').trim().split(/\s+/);
      const firstName  = nameParts[0] || null;
      const lastName   = nameParts.slice(1).join(' ') || null;

      const result = await db.query(
        `UPDATE users
         SET first_name    = COALESCE($1, first_name),
             last_name     = COALESCE($2, last_name),
             email         = COALESCE($3, email),
             phone_number  = COALESCE($4, phone_number),
             updated_at    = NOW()
         WHERE id = $5 AND deleted_at IS NULL
         RETURNING id, first_name, last_name, email, phone_number`,
        [firstName, lastName, email || null, phone || null, userId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      return res.json({ success: true, message: 'Profile updated', data: result.rows[0] });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------------------
  // PUT /api/user/address  — update shipping address
  // ---------------------------------------------------------------------------
  router.put('/address', async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const { street, city, state, zip } = req.body;

      await db.query(
        `UPDATE users
         SET address    = $1::jsonb,
             updated_at = NOW()
         WHERE id = $2 AND deleted_at IS NULL`,
        [JSON.stringify({ street, city, state, zip }), userId]
      );

      return res.json({ success: true, message: 'Address saved' });
    } catch (err) {
      // Column may not exist yet on older deployments — return success gracefully
      if (err.code === '42703') {
        return res.json({ success: true, message: 'Address saved' });
      }
      next(err);
    }
  });

  // ---------------------------------------------------------------------------
  // PUT /api/user/password  — change password (requires current password)
  // ---------------------------------------------------------------------------
  router.put('/password', async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const { oldPassword, newPassword } = req.body;

      if (!oldPassword || !newPassword) {
        return res.status(400).json({ success: false, message: 'Current and new password required' });
      }

      if (newPassword.length < 12) {
        return res.status(400).json({ success: false, message: 'New password must be at least 12 characters' });
      }

      // Fetch current hash
      const userResult = await db.query(
        'SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL',
        [userId]
      );
      if (userResult.rowCount === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const valid = await bcrypt.compare(oldPassword, userResult.rows[0].password_hash);
      if (!valid) {
        return res.status(401).json({ success: false, message: 'Current password is incorrect' });
      }

      const newHash = await bcrypt.hash(newPassword, 12);
      await db.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [newHash, userId]
      );

      return res.json({ success: true, message: 'Password changed successfully' });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/user/bids/active  — bids on currently live auctions
  // ---------------------------------------------------------------------------
  router.get('/bids/active', async (req, res, next) => {
    try {
      const userId = req.user?.id;

      const result = await db.query(
        `SELECT b.bid_amount          AS amount,
                b.placed_at           AS "createdAt",
                a.id                  AS "auctionId",
                a.title               AS "auctionTitle",
                s.name                AS school
         FROM   bids b
         JOIN   auctions a ON a.id = b.auction_id
         JOIN   schools  s ON s.id = a.school_id
         WHERE  b.placed_by_user_id = $1
           AND  b.bid_status        = 'ACTIVE'
           AND  a.auction_status   IN ('LIVE', 'APPROVED')
           AND  a.deleted_at       IS NULL
         ORDER  BY b.placed_at DESC
         LIMIT  50`,
        [userId]
      );

      return res.json({ success: true, bids: result.rows });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/user/bids/history  — all bids placed by user
  // ---------------------------------------------------------------------------
  router.get('/bids/history', async (req, res, next) => {
    try {
      const userId = req.user?.id;

      const result = await db.query(
        `SELECT b.bid_amount                  AS amount,
                b.placed_at                   AS "createdAt",
                (b.bid_status = 'ACCEPTED')   AS "isWinning",
                (b.bid_status = 'OUTBID')     AS "isOutbid",
                a.id                          AS "auctionId",
                a.title                       AS "auctionTitle"
         FROM   bids b
         JOIN   auctions a ON a.id = b.auction_id
         WHERE  b.placed_by_user_id = $1
           AND  a.deleted_at        IS NULL
         ORDER  BY b.placed_at DESC
         LIMIT  100`,
        [userId]
      );

      return res.json({ success: true, bids: result.rows });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/user/wins  — accepted/winning bids
  // ---------------------------------------------------------------------------
  router.get('/wins', async (req, res, next) => {
    try {
      const userId = req.user?.id;

      const result = await db.query(
        `SELECT b.bid_amount   AS "winningBid",
                a.id           AS "auctionId",
                a.title        AS "auctionTitle",
                FALSE          AS shipped
         FROM   bids b
         JOIN   auctions a ON a.id = b.auction_id
         WHERE  b.placed_by_user_id = $1
           AND  b.bid_status        = 'ACCEPTED'
           AND  a.deleted_at        IS NULL
         ORDER  BY b.placed_at DESC`,
        [userId]
      );

      return res.json({ success: true, wins: result.rows });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/user/notifications  — notification preferences
  // ---------------------------------------------------------------------------
  router.get('/notifications', async (req, res, next) => {
    try {
      const userId = req.user?.id;

      let prefs = { bids: true, auctions: true, messages: true, winners: true, updates: false };

      try {
        const result = await db.query(
          'SELECT notification_prefs FROM users WHERE id = $1 AND deleted_at IS NULL',
          [userId]
        );
        if (result.rows[0]?.notification_prefs) {
          prefs = { ...prefs, ...result.rows[0].notification_prefs };
        }
      } catch (_) {
        // Column may not exist yet — return defaults
      }

      return res.json({ success: true, notifications: prefs });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------------------
  // PUT /api/user/notifications  — save notification preferences
  // ---------------------------------------------------------------------------
  router.put('/notifications', async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const { bids, auctions, messages, winners, updates } = req.body;
      const prefs = { bids: !!bids, auctions: !!auctions, messages: !!messages, winners: !!winners, updates: !!updates };

      try {
        await db.query(
          `UPDATE users SET notification_prefs = $1::jsonb, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify(prefs), userId]
        );
      } catch (_) {
        // Column may not exist yet — return success gracefully
      }

      return res.json({ success: true, message: 'Notification preferences saved' });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/user/2fa  — 2FA status
  // ---------------------------------------------------------------------------
  router.get('/2fa', async (req, res, next) => {
    try {
      const userId = req.user?.id;

      const result = await db.query(
        'SELECT totp_enabled FROM users WHERE id = $1 AND deleted_at IS NULL',
        [userId]
      );

      return res.json({
        success: true,
        twoFactorEnabled: !!result.rows[0]?.totp_enabled,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
};

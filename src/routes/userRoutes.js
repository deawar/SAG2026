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

/**
 * Validate and return a base64 image data URL for direct DB storage.
 * Returns null if imageData is absent or not a recognised image type.
 * Storing the data URL in the DB avoids filesystem permission issues
 * in containerised deployments where the app root is read-only.
 */
function saveBase64Image(imageData) {
  if (!imageData) {return null;}
  const valid = /^data:image\/(jpeg|png|gif|webp);base64,[A-Za-z0-9+/]+=*$/.test(imageData);
  return valid ? imageData : null;
}

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
  // GET /api/user/wins/:auctionId  — single win detail for checkout
  // ---------------------------------------------------------------------------
  router.get('/wins/:auctionId', async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const { auctionId } = req.params;

      const result = await db.query(
        `SELECT b.id           AS "bidId",
                b.bid_amount   AS "winningBid",
                a.id           AS "auctionId",
                a.title        AS "auctionTitle",
                aw.title       AS "artworkTitle",
                aw.id          AS "artworkId",
                FALSE          AS shipped
         FROM   bids b
         JOIN   auctions a  ON a.id  = b.auction_id
         LEFT JOIN artwork aw ON aw.auction_id = a.id AND aw.deleted_at IS NULL
         WHERE  b.placed_by_user_id = $1
           AND  b.bid_status        = 'ACCEPTED'
           AND  a.id                = $2
           AND  a.deleted_at        IS NULL
         LIMIT 1`,
        [userId, auctionId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, message: 'Win not found' });
      }

      return res.json({ success: true, win: result.rows[0] });
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
      } catch (colErr) {
        // Column may not exist yet on older deployments — return defaults
        if (colErr.code !== '42703') {throw colErr;}
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
          'UPDATE users SET notification_prefs = $1::jsonb, updated_at = NOW() WHERE id = $2',
          [JSON.stringify(prefs), userId]
        );
      } catch (colErr) {
        // Column may not exist yet on older deployments — ignore gracefully
        if (colErr.code !== '42703') {throw colErr;}
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
        twoFactorEnabled: !!result.rows[0]?.totp_enabled
      });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/user/artwork  — list student's own artwork submissions
  // ---------------------------------------------------------------------------
  router.get('/artwork', async (req, res, next) => {
    try {
      const userId = req.user?.id;

      const result = await db.query(
        `SELECT aw.id, aw.title, aw.artist_name, aw.medium,
                aw.dimensions_width_cm, aw.dimensions_height_cm,
                aw.starting_bid_amount, aw.description,
                aw.image_url, aw.artwork_status, aw.rejection_reason,
                aw.created_at, aw.updated_at,
                a.id AS "auctionId", a.title AS "auctionTitle"
         FROM   artwork aw
         JOIN   auctions a ON a.id = aw.auction_id
         WHERE  aw.created_by_user_id = $1
           AND  aw.deleted_at IS NULL
         ORDER  BY aw.created_at DESC`,
        [userId]
      );

      return res.json({ success: true, artwork: result.rows });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/user/artwork/auctions  — auctions the student can submit to
  //   (school-scoped, status DRAFT or APPROVED)
  // ---------------------------------------------------------------------------
  router.get('/artwork/auctions', async (req, res, next) => {
    try {
      const schoolId = req.user?.schoolId;

      if (!schoolId) {
        return res.json({ success: true, auctions: [] });
      }

      const result = await db.query(
        `SELECT id, title, starts_at, ends_at, auction_status
         FROM   auctions
         WHERE  school_id  = $1
           AND  auction_status IN ('DRAFT', 'APPROVED', 'LIVE')
           AND  deleted_at IS NULL
         ORDER  BY starts_at ASC`,
        [schoolId]
      );

      return res.json({ success: true, auctions: result.rows });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/user/artwork  — student submits artwork
  //   Body: { auctionId, title, artistName, medium, width, height,
  //           startingBid, description, imageData (base64 data URL) }
  // ---------------------------------------------------------------------------
  router.post('/artwork', async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const {
        auctionId, title, artistName, medium,
        width, height, startingBid, description, imageData
      } = req.body;

      if (!auctionId || !title || !artistName || startingBid === undefined) {
        return res.status(400).json({
          success: false,
          message: 'auctionId, title, artistName, and startingBid are required'
        });
      }

      // Verify the auction belongs to the student's school
      const schoolId = req.user?.schoolId;
      const auctionCheck = await db.query(
        `SELECT id FROM auctions
         WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL
           AND auction_status IN ('DRAFT', 'APPROVED', 'LIVE')`,
        [auctionId, schoolId]
      );
      if (auctionCheck.rowCount === 0) {
        return res.status(403).json({ success: false, message: 'Auction not found or not open for submissions' });
      }

      // Save image to disk if provided
      const imageUrl = saveBase64Image(imageData);

      const result = await db.query(
        `INSERT INTO artwork
           (auction_id, created_by_user_id, title, artist_name, medium,
            dimensions_width_cm, dimensions_height_cm, starting_bid_amount,
            description, image_url, artwork_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'SUBMITTED')
         RETURNING id, title, artwork_status, created_at`,
        [
          auctionId, userId,
          title.trim(), artistName.trim(),
          medium || null,
          width  ? Number.parseFloat(width)  : null,
          height ? Number.parseFloat(height) : null,
          Number.parseFloat(startingBid),
          description || null,
          imageUrl
        ]
      );

      return res.status(201).json({ success: true, artwork: result.rows[0] });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/user  — soft-delete own account (GDPR right to erasure)
  // PII is anonymised; bids/payments/artworks are preserved for audit.
  // ---------------------------------------------------------------------------
  router.delete('/', async (req, res, next) => {
    try {
      const userId = req.user?.id;

      // Anonymise PII and mark account deleted
      const result = await db.query(
        `UPDATE users
         SET deleted_at    = NOW(),
             email         = CONCAT('deleted-', id, '@deleted.local'),
             first_name    = NULL,
             last_name     = NULL,
             phone_number  = NULL,
             address       = NULL,
             two_fa_secret = NULL,
             backup_codes  = NULL,
             updated_at    = NOW()
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING id`,
        [userId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Revoke all active sessions
      await db.query(
        `UPDATE user_sessions SET revoked_at = NOW()
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId]
      );

      // Remove any pending password reset tokens
      await db.query(
        'DELETE FROM password_reset_tokens WHERE user_id = $1',
        [userId]
      );

      // Blacklist the current access token (best-effort; expires in ≤15 min anyway)
      try {
        const { jti, exp } = req.user;
        if (jti) {
          const expiresAt = exp
            ? new Date(exp * 1000)
            : new Date(Date.now() + 15 * 60 * 1000);
          await authenticationService.tokenBlacklist.revoke(jti, expiresAt);
        }
      } catch (_err) {
        // Non-blocking: token will expire naturally within 15 minutes
      }

      // Audit log
      await db.query(
        `INSERT INTO audit_logs (user_id, action_category, action_type, action_details)
         VALUES ($1, 'USER', 'SELF_DELETED', $2)`,
        [userId, JSON.stringify({})]
      );

      return res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/user/artwork/:id  — withdraw a submission (own artwork only)
  // ---------------------------------------------------------------------------
  router.delete('/artwork/:id', async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      const result = await db.query(
        `UPDATE artwork
         SET artwork_status = 'WITHDRAWN', deleted_at = NOW(), updated_at = NOW()
         WHERE id = $1
           AND created_by_user_id = $2
           AND artwork_status IN ('SUBMITTED', 'PENDING_APPROVAL', 'REJECTED')
           AND deleted_at IS NULL
         RETURNING id`,
        [id, userId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, message: 'Artwork not found or cannot be withdrawn' });
      }

      return res.json({ success: true, message: 'Submission withdrawn' });
    } catch (err) {
      next(err);
    }
  });

  return router;
};

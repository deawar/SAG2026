/**
 * Student Portfolio Routes — mounted at /api/portfolio behind verifyToken.
 * A portfolio item belongs to exactly one student (req.user.id). Items are
 * never exposed on any public route.
 */
const express = require('express');
const { validateImageDataUrl } = require('../utils/imageUtils');

function mapItem(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    medium: row.medium ?? null,
    artistGrade: row.artist_grade ?? null,
    imageUrl: row.image_url ?? null,
    portfolioStatus: row.portfolio_status,
    submissionState: row.submission_state,
    rejectionReason: row.rejection_reason ?? null,
    createdAt: row.created_at
  };
}

module.exports = (db) => {
  const router = express.Router();

  // POST /api/portfolio — create a piece for the current student
  router.post('/', async (req, res, next) => {
    try {
      const studentId = req.user?.id;
      const schoolId = req.user?.schoolId || null;
      const { title, description, medium, artistGrade, width, height, imageData } = req.body;

      if (!title || !title.trim()) {
        return res.status(400).json({ success: false, message: 'title is required' });
      }
      const imageUrl = validateImageDataUrl(imageData);

      const result = await db.query(
        `INSERT INTO portfolio_items
           (student_user_id, school_id, title, description, medium, artist_grade,
            dimensions_width_cm, dimensions_height_cm, image_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id, title, description, medium, artist_grade, image_url,
                   portfolio_status, submission_state, rejection_reason, created_at`,
        [
          studentId, schoolId, title.trim(),
          description || null, medium || null, artistGrade || null,
          width ? Number.parseFloat(width) : null,
          height ? Number.parseFloat(height) : null,
          imageUrl
        ]
      );
      return res.status(201).json({ success: true, item: mapItem(result.rows[0]) });
    } catch (err) { return next(err); }
  });

  // GET /api/portfolio — list the current student's pieces (both buckets)
  router.get('/', async (req, res, next) => {
    try {
      const studentId = req.user?.id;
      const result = await db.query(
        `SELECT id, title, description, medium, artist_grade, image_url,
                portfolio_status, submission_state, rejection_reason, created_at
         FROM portfolio_items
         WHERE student_user_id = $1 AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [studentId]
      );
      return res.json({ success: true, items: result.rows.map(mapItem) });
    } catch (err) { return next(err); }
  });

  const LOCKED = new Set(['PENDING_REVIEW', 'IN_AUCTION']);

  // Load an own, non-deleted item; returns row or null.
  async function loadOwnItem(conn, itemId, studentId) {
    const r = await conn.query(
      `SELECT id, student_user_id, submission_state FROM portfolio_items
       WHERE id = $1 AND student_user_id = $2 AND deleted_at IS NULL`,
      [itemId, studentId]
    );
    return r.rows[0] || null;
  }

  // PUT /api/portfolio/:id — edit fields (blocked while locked)
  router.put('/:id', async (req, res, next) => {
    try {
      const item = await loadOwnItem(db, req.params.id, req.user?.id);
      if (!item) { return res.status(404).json({ success: false, message: 'Not found' }); }
      if (LOCKED.has(item.submission_state)) {
        return res.status(409).json({ success: false, message: 'Piece is locked while under review or in an auction' });
      }
      const { title, description, medium, artistGrade, width, height, imageData } = req.body;
      if (title !== undefined && !title.trim()) {
        return res.status(400).json({ success: false, message: 'title cannot be empty' });
      }
      const imageUrl = imageData !== undefined ? validateImageDataUrl(imageData) : undefined;
      const result = await db.query(
        `UPDATE portfolio_items SET
            title       = COALESCE($2, title),
            description = COALESCE($3, description),
            medium      = COALESCE($4, medium),
            artist_grade= COALESCE($5, artist_grade),
            dimensions_width_cm  = COALESCE($6, dimensions_width_cm),
            dimensions_height_cm = COALESCE($7, dimensions_height_cm),
            image_url   = COALESCE($8, image_url),
            updated_at  = NOW()
         WHERE id = $1 AND student_user_id = $9
         RETURNING id, title, description, medium, artist_grade, image_url,
                   portfolio_status, submission_state, rejection_reason, created_at`,
        [
          req.params.id,
          title !== undefined ? title.trim() : null,
          description !== undefined ? description : null,
          medium !== undefined ? medium : null,
          artistGrade !== undefined ? artistGrade : null,
          width !== undefined ? Number.parseFloat(width) : null,
          height !== undefined ? Number.parseFloat(height) : null,
          imageUrl !== undefined ? imageUrl : null,
          req.user?.id
        ]
      );
      return res.json({ success: true, item: mapItem(result.rows[0]) });
    } catch (err) { return next(err); }
  });

  // PATCH /api/portfolio/:id/status — toggle bucket
  router.patch('/:id/status', async (req, res, next) => {
    try {
      const { portfolioStatus } = req.body;
      if (!['IN_PROGRESS', 'COMPLETED'].includes(portfolioStatus)) {
        return res.status(400).json({ success: false, message: 'portfolioStatus must be IN_PROGRESS or COMPLETED' });
      }
      const item = await loadOwnItem(db, req.params.id, req.user?.id);
      if (!item) { return res.status(404).json({ success: false, message: 'Not found' }); }
      const result = await db.query(
        `UPDATE portfolio_items SET portfolio_status = $2, updated_at = NOW()
         WHERE id = $1 AND student_user_id = $3
         RETURNING id, title, description, medium, artist_grade, image_url,
                   portfolio_status, submission_state, rejection_reason, created_at`,
        [req.params.id, portfolioStatus, req.user?.id]
      );
      return res.json({ success: true, item: mapItem(result.rows[0]) });
    } catch (err) { return next(err); }
  });

  // DELETE /api/portfolio/:id — soft delete (blocked while locked)
  router.delete('/:id', async (req, res, next) => {
    try {
      const item = await loadOwnItem(db, req.params.id, req.user?.id);
      if (!item) { return res.status(404).json({ success: false, message: 'Not found' }); }
      if (LOCKED.has(item.submission_state)) {
        return res.status(409).json({ success: false, message: 'Piece is locked while under review or in an auction' });
      }
      await db.query('UPDATE portfolio_items SET deleted_at = NOW() WHERE id = $1 AND student_user_id = $2', [req.params.id, req.user?.id]);
      return res.json({ success: true });
    } catch (err) { return next(err); }
  });

  // POST /api/portfolio/:id/submit — snapshot a COMPLETED piece into an auction
  router.post('/:id/submit', async (req, res, next) => {
    try {
      const studentId = req.user?.id;
      const schoolId = req.user?.schoolId || null;
      const { auctionId } = req.body;
      if (!auctionId) { return res.status(400).json({ success: false, message: 'auctionId is required' }); }

      const itemRes = await db.query(
        `SELECT id, student_user_id, portfolio_status, submission_state, title, description,
                medium, artist_grade, dimensions_width_cm, dimensions_height_cm, image_url
         FROM portfolio_items WHERE id = $1 AND student_user_id = $2 AND deleted_at IS NULL`,
        [req.params.id, studentId]
      );
      const item = itemRes.rows[0];
      if (!item) { return res.status(404).json({ success: false, message: 'Not found' }); }
      if (item.portfolio_status !== 'COMPLETED' || !['NOT_SUBMITTED', 'REJECTED', 'UNSOLD', 'WITHDRAWN'].includes(item.submission_state)) {
        return res.status(409).json({ success: false, message: 'Only a completed, un-submitted piece can be submitted' });
      }

      const auctionRes = await db.query(
        `SELECT id FROM auctions
         WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL
           AND auction_status IN ('DRAFT','APPROVED','LIVE')`,
        [auctionId, schoolId]
      );
      if (auctionRes.rowCount === 0) {
        return res.status(403).json({ success: false, message: 'Auction not found or not open for submissions' });
      }

      const nameRes = await db.query('SELECT first_name, last_name FROM users WHERE id = $1', [studentId]);
      const artistName = nameRes.rows[0]
        ? `${nameRes.rows[0].first_name} ${nameRes.rows[0].last_name || ''}`.trim()
        : 'Student Artist';

      await db.query(
        `INSERT INTO artwork
           (auction_id, created_by_user_id, portfolio_item_id, title, artist_name, medium,
            artist_grade, dimensions_width_cm, dimensions_height_cm, starting_bid_amount,
            description, image_url, artwork_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,'SUBMITTED')
         RETURNING id`,
        [
          auctionId, studentId, req.params.id, item.title, artistName, item.medium,
          item.artist_grade, item.dimensions_width_cm, item.dimensions_height_cm,
          item.description, item.image_url
        ]
      );

      await db.query(
        'UPDATE portfolio_items SET submission_state = \'PENDING_REVIEW\', rejection_reason = NULL, updated_at = NOW() WHERE id = $1 AND student_user_id = $2',
        [req.params.id, studentId]
      );
      return res.json({ success: true, submissionState: 'PENDING_REVIEW' });
    } catch (err) { return next(err); }
  });

  // POST /api/portfolio/:id/withdraw — pull back a pending submission
  router.post('/:id/withdraw', async (req, res, next) => {
    try {
      const item = await loadOwnItem(db, req.params.id, req.user?.id);
      if (!item) { return res.status(404).json({ success: false, message: 'Not found' }); }
      if (item.submission_state !== 'PENDING_REVIEW') {
        return res.status(409).json({ success: false, message: 'Only a pending submission can be withdrawn' });
      }
      await db.query(
        `UPDATE artwork SET deleted_at = NOW()
         WHERE portfolio_item_id = $1 AND artwork_status = 'SUBMITTED' AND deleted_at IS NULL`,
        [req.params.id]
      );
      await db.query(
        'UPDATE portfolio_items SET submission_state = \'WITHDRAWN\', updated_at = NOW() WHERE id = $1 AND student_user_id = $2',
        [req.params.id, req.user?.id]
      );
      return res.json({ success: true, submissionState: 'WITHDRAWN' });
    } catch (err) { return next(err); }
  });

  return router;
};

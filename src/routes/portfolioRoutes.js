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

  return router;
};

/**
 * Portfolio comment routes — mounted at /api/portfolio-comments behind verifyToken
 * (NOT under the STUDENT-gated /api/portfolio). Access to a piece's thread is
 * governed by resolveAccess: owner student, inviting teacher, or same-school admin.
 */
const express = require('express');

const MAX_BODY = 2000;

// Returns { status: 200|403|404, piece, canModerate } for the viewer against a piece.
async function resolveAccess(db, viewer, itemId) {
  const pieceRes = await db.query(
    `SELECT id, student_user_id, school_id FROM portfolio_items
      WHERE id = $1 AND deleted_at IS NULL`,
    [itemId]
  );
  const piece = pieceRes.rows[0];
  if (!piece) { return { status: 404 }; }

  if (piece.student_user_id === viewer.id) { return { status: 200, piece, canModerate: false }; }

  if (viewer.role === 'SCHOOL_ADMIN' && viewer.schoolId && viewer.schoolId === piece.school_id) {
    return { status: 200, piece, canModerate: true };
  }

  if (viewer.role === 'TEACHER') {
    const scope = await db.query(
      `SELECT 1 FROM registration_tokens rt
         JOIN users u ON LOWER(u.email) = LOWER(rt.student_email)
        WHERE rt.teacher_id = $1 AND u.id = $2 AND u.role = 'STUDENT' AND u.deleted_at IS NULL
        LIMIT 1`,
      [viewer.id, piece.student_user_id]
    );
    if (scope.rowCount > 0) { return { status: 200, piece, canModerate: true }; }
  }
  return { status: 403 };
}

function mapComment(row, viewerId) {
  const name = row.author_user_id
    ? `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'User'
    : 'Removed user';
  return {
    id: row.id,
    body: row.body,
    authorName: name,
    authorRole: row.author_role,
    isOwnByViewer: row.author_user_id === viewerId,
    createdAt: row.created_at
  };
}

module.exports = (db) => {
  const router = express.Router();

  // GET /api/portfolio-comments/item/:itemId — list + mark read
  router.get('/item/:itemId', async (req, res, next) => {
    try {
      const viewer = req.user;
      const access = await resolveAccess(db, viewer, req.params.itemId);
      if (access.status !== 200) { return res.status(access.status).json({ success: false, message: access.status === 404 ? 'Not found' : 'Not permitted' }); }

      const listed = await db.query(
        `SELECT c.id, c.body, c.author_user_id, c.author_role, c.created_at,
                u.first_name, u.last_name
           FROM portfolio_comments c
           LEFT JOIN users u ON u.id = c.author_user_id
          WHERE c.portfolio_item_id = $1 AND c.deleted_at IS NULL
          ORDER BY c.created_at ASC`,
        [req.params.itemId]
      );
      await db.query(
        `INSERT INTO portfolio_comment_reads (user_id, portfolio_item_id, last_read_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id, portfolio_item_id) DO UPDATE SET last_read_at = NOW()`,
        [viewer.id, req.params.itemId]
      );
      return res.json({
        success: true,
        comments: listed.rows.map(r => mapComment(r, viewer.id)),
        canModerate: access.canModerate
      });
    } catch (err) { return next(err); }
  });

  // POST /api/portfolio-comments/item/:itemId — create
  router.post('/item/:itemId', async (req, res, next) => {
    try {
      const viewer = req.user;
      const body = (req.body.body || '').trim();
      if (body.length < 1 || body.length > MAX_BODY) {
        return res.status(400).json({ success: false, message: `Comment must be 1–${MAX_BODY} characters` });
      }
      const access = await resolveAccess(db, viewer, req.params.itemId);
      if (access.status !== 200) { return res.status(access.status).json({ success: false, message: access.status === 404 ? 'Not found' : 'Not permitted' }); }
      const ins = await db.query(
        `INSERT INTO portfolio_comments (portfolio_item_id, school_id, author_user_id, author_role, body)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, body, author_role, created_at`,
        [req.params.itemId, access.piece.school_id, viewer.id, viewer.role, body]
      );
      const row = ins.rows[0];
      return res.status(201).json({
        success: true,
        comment: { id: row.id, body: row.body, authorName: 'You', authorRole: row.author_role, isOwnByViewer: true, createdAt: row.created_at }
      });
    } catch (err) { return next(err); }
  });

  // DELETE /api/portfolio-comments/:commentId — author or moderator
  router.delete('/:commentId', async (req, res, next) => {
    try {
      const viewer = req.user;
      const cRes = await db.query(
        `SELECT id, portfolio_item_id, author_user_id FROM portfolio_comments
          WHERE id = $1 AND deleted_at IS NULL`,
        [req.params.commentId]
      );
      const comment = cRes.rows[0];
      if (!comment) { return res.status(404).json({ success: false, message: 'Not found' }); }

      const access = await resolveAccess(db, viewer, comment.portfolio_item_id);
      if (access.status !== 200) { return res.status(access.status).json({ success: false, message: 'Not permitted' }); }

      const isAuthor = comment.author_user_id === viewer.id;
      if (!isAuthor && !access.canModerate) { return res.status(403).json({ success: false, message: 'Not permitted' }); }

      await db.query(
        `UPDATE portfolio_comments SET deleted_at = NOW(), deleted_by_user_id = $2, updated_at = NOW()
          WHERE id = $1`,
        [comment.id, viewer.id]
      );
      await db.query(
        `INSERT INTO audit_logs (action_category, action_type, resource_type, resource_id, action_details)
         VALUES ($1,$2,$3,$4,$5)`,
        ['PORTFOLIO', 'comment_deleted', 'portfolio_comment', comment.id,
          JSON.stringify({ deletedBy: viewer.id, moderated: !isAuthor })]
      );
      return res.json({ success: true });
    } catch (err) { return next(err); }
  });

  return router;
};

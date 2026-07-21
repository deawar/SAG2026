'use strict';

class GalleryCommentModel {
  constructor(db) { this.db = db; }

  async createComment({ portfolioItemId, authorUserId, authorSchoolId, body }) {
    const r = await this.db.query(
      `INSERT INTO gallery_comments (portfolio_item_id, author_user_id, author_school_id, body)
       VALUES ($1,$2,$3,$4) RETURNING id, status, created_at`,
      [portfolioItemId, authorUserId, authorSchoolId, body]
    );
    return r.rows[0];
  }

  // Read path: APPROVED only, author FIRST NAME only (minor-PII least privilege).
  async listApprovedForItem(itemId) {
    const r = await this.db.query(
      `SELECT c.id, c.body, c.created_at AS "createdAt", u.first_name AS "authorFirstName"
         FROM gallery_comments c
         LEFT JOIN users u ON u.id = c.author_user_id
        WHERE c.portfolio_item_id = $1 AND c.status = 'APPROVED'
        ORDER BY c.created_at ASC`,
      [itemId]
    );
    return r.rows;
  }

  // Moderation queue: PENDING comments on items whose owner's LIVE school = schoolId.
  async listPendingForSchool(schoolId) {
    const r = await this.db.query(
      `SELECT c.id, c.body, c.created_at AS "createdAt", c.portfolio_item_id AS "portfolioItemId",
              pi.title AS "itemTitle", au.first_name AS "authorFirstName",
              CASE WHEN au.school_id = $1 THEN 'SAME_SCHOOL' ELSE 'CROSS_SCHOOL' END AS "authorOrigin"
         FROM gallery_comments c
         JOIN portfolio_items pi ON pi.id = c.portfolio_item_id
         JOIN users owner ON owner.id = pi.student_user_id
         LEFT JOIN users au ON au.id = c.author_user_id
        WHERE c.status = 'PENDING' AND owner.school_id = $1
        ORDER BY c.created_at ASC`,
      [schoolId]
    );
    return r.rows;
  }

  // School-scoped single-statement moderation: no row unless the comment is PENDING
  // AND the item's owner currently belongs to the moderator's school (host-only authority).
  async moderateComment(commentId, moderatorSchoolId, status, moderatorUserId) {
    const r = await this.db.query(
      `UPDATE gallery_comments c
          SET status = $3, moderated_by_user_id = $4, moderated_at = NOW()
         FROM portfolio_items pi
         JOIN users owner ON owner.id = pi.student_user_id
        WHERE c.id = $1 AND c.status = 'PENDING'
          AND pi.id = c.portfolio_item_id
          AND owner.school_id = $2
        RETURNING c.id, c.status`,
      [commentId, moderatorSchoolId, status, moderatorUserId]
    );
    return r.rows[0] || null;
  }
}

module.exports = GalleryCommentModel;

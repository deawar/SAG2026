'use strict';

class GalleryModel {
  constructor(db) { this.db = db; }

  // Content = VISIBLE + shared + non-deleted items of students whose CURRENT school = schoolId
  // AND who are on that school's roster. Never keys on portfolio_items.school_id (a snapshot).
  async getSchoolGalleryItems(schoolId) {
    const r = await this.db.query(
      `SELECT pi.id, pi.title, pi.medium, pi.image_url AS "imageUrl",
              pi.artist_grade AS "artistGrade", u.first_name AS "artistFirstName",
              pi.gallery_comments_allowed AS "commentsAllowed", pi.created_at AS "createdAt"
         FROM portfolio_items pi
         JOIN users u ON u.id = pi.student_user_id AND u.deleted_at IS NULL
         JOIN gallery_roster gr ON gr.student_user_id = pi.student_user_id AND gr.school_id = $1
        WHERE u.school_id = $1
          AND pi.shared_to_gallery = true
          AND pi.moderation_status = 'VISIBLE'
          AND pi.deleted_at IS NULL
        ORDER BY pi.created_at DESC`,
      [schoolId]
    );
    return r.rows;
  }

  async setItemGalleryFlags(itemId, studentUserId, { sharedToGallery, commentsAllowed }) {
    const r = await this.db.query(
      `UPDATE portfolio_items
          SET shared_to_gallery = COALESCE($3, shared_to_gallery),
              gallery_comments_allowed = COALESCE($4, gallery_comments_allowed),
              updated_at = NOW()
        WHERE id = $1 AND student_user_id = $2 AND deleted_at IS NULL
        RETURNING id, shared_to_gallery, gallery_comments_allowed`,
      [itemId, studentUserId,
        sharedToGallery === undefined ? null : sharedToGallery,
        commentsAllowed === undefined ? null : commentsAllowed]
    );
    return r.rows[0] || null;
  }

  async addToRoster(schoolId, studentUserId, addedByUserId) {
    await this.db.query(
      `INSERT INTO gallery_roster (school_id, student_user_id, added_by_user_id)
       VALUES ($1, $2, $3) ON CONFLICT (school_id, student_user_id) DO NOTHING`,
      [schoolId, studentUserId, addedByUserId]
    );
  }

  async removeFromRoster(schoolId, studentUserId) {
    const r = await this.db.query(
      'DELETE FROM gallery_roster WHERE school_id = $1 AND student_user_id = $2',
      [schoolId, studentUserId]
    );
    return r.rowCount;
  }

  async resolveViewer(userId) {
    const r = await this.db.query(
      'SELECT id, role, school_id FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );
    return r.rows[0] || null;
  }
}

module.exports = GalleryModel;

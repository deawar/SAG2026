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

  // An item is commentable/readable only while it is live gallery content:
  // shared + VISIBLE + not deleted, owner active and on their CURRENT school's roster.
  async getCommentableItem(itemId) {
    const r = await this.db.query(
      `SELECT pi.id, pi.student_user_id, u.school_id AS owner_school_id,
              pi.gallery_comments_allowed, pi.artist_grade
         FROM portfolio_items pi
         JOIN users u ON u.id = pi.student_user_id AND u.deleted_at IS NULL
         JOIN gallery_roster gr ON gr.student_user_id = pi.student_user_id AND gr.school_id = u.school_id
        WHERE pi.id = $1
          AND pi.shared_to_gallery = true
          AND pi.moderation_status = 'VISIBLE'
          AND pi.deleted_at IS NULL`,
      [itemId]
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

  async listRoster(schoolId) {
    const r = await this.db.query(
      `SELECT gr.student_user_id AS "studentUserId", u.first_name AS "firstName",
              u.last_name AS "lastName", u.grade_level AS "gradeLevel"
         FROM gallery_roster gr
         JOIN users u ON u.id = gr.student_user_id AND u.deleted_at IS NULL
        WHERE gr.school_id = $1
        ORDER BY u.last_name ASC, u.first_name ASC`,
      [schoolId]
    );
    return r.rows;
  }

  async resolveViewer(userId) {
    const r = await this.db.query(
      'SELECT id, role, school_id, grade_level FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );
    return r.rows[0] || null;
  }

  // When a student leaves/changes school: drop them from all rosters, remove all their
  // cross-school enablements, and reset their gallery opt-in (re-consent at the new school).
  async cascadeStudentSchoolChange(studentUserId) {
    await this.db.query('DELETE FROM gallery_roster WHERE student_user_id = $1', [studentUserId]);
    await this.db.query('DELETE FROM gallery_grant_members WHERE student_user_id = $1', [studentUserId]);
    await this.db.query('UPDATE portfolio_items SET shared_to_gallery = false, updated_at = NOW() WHERE student_user_id = $1', [studentUserId]);
  }
}

module.exports = GalleryModel;

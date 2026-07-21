'use strict';
class GalleryGrantModel {
  constructor(db) { this.db = db; }

  async createGrant({ hostSchoolId, hostBand, invitedEmail, invitedByUserId, tokenHash, expiresAt }) {
    const r = await this.db.query(
      `INSERT INTO gallery_grants (host_school_id, host_band, invited_email, invited_by_user_id, invite_token_hash, token_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [hostSchoolId, hostBand, invitedEmail, invitedByUserId, tokenHash, expiresAt]
    );
    return r.rows[0];
  }

  async getPendingByTokenHash(tokenHash) {
    const r = await this.db.query(
      `SELECT * FROM gallery_grants
        WHERE invite_token_hash = $1 AND status = 'PENDING' AND token_expires_at > NOW() LIMIT 1`,
      [tokenHash]
    );
    return r.rows[0] || null;
  }

  async acceptGrant(grantId, { invitedSchoolId, invitedTeacherUserId }) {
    const r = await this.db.query(
      `UPDATE gallery_grants
          SET status='ACCEPTED', invited_school_id=$2, invited_teacher_user_id=$3, accepted_at=NOW()
        WHERE id=$1 AND status='PENDING'
        RETURNING id, status`,
      [grantId, invitedSchoolId, invitedTeacherUserId]
    );
    return r.rows[0] || null;
  }

  async revokeGrant(grantId, revokedByUserId) {
    const r = await this.db.query(
      `UPDATE gallery_grants
          SET status='REVOKED', revoked_at=NOW(), revoked_by_user_id=$2
        WHERE id=$1 AND status IN ('PENDING','ACCEPTED')
        RETURNING id, status`,
      [grantId, revokedByUserId]
    );
    return r.rows[0] || null;
  }

  async getGrantForRevoker(grantId) {
    const r = await this.db.query(
      'SELECT id, host_school_id, invited_school_id, invited_teacher_user_id, status FROM gallery_grants WHERE id=$1',
      [grantId]
    );
    return r.rows[0] || null;
  }

  async listGrantsForHost(hostSchoolId) {
    const r = await this.db.query(
      `SELECT id, invited_email, invited_school_id, invited_teacher_user_id, status, created_at, accepted_at
         FROM gallery_grants WHERE host_school_id=$1 ORDER BY created_at DESC`, [hostSchoolId]);
    return r.rows;
  }

  async listGrantsForInvitedTeacher(userId) {
    const r = await this.db.query(
      `SELECT id, host_school_id, status, accepted_at FROM gallery_grants
        WHERE invited_teacher_user_id=$1 AND status='ACCEPTED' ORDER BY accepted_at DESC`, [userId]);
    return r.rows;
  }

  async addMember(grantId, studentUserId, enabledByUserId) {
    await this.db.query(
      `INSERT INTO gallery_grant_members (grant_id, student_user_id, enabled_by_user_id)
       VALUES ($1,$2,$3) ON CONFLICT (grant_id, student_user_id) DO NOTHING`,
      [grantId, studentUserId, enabledByUserId]);
  }

  async removeMember(grantId, studentUserId) {
    const r = await this.db.query('DELETE FROM gallery_grant_members WHERE grant_id=$1 AND student_user_id=$2', [grantId, studentUserId]);
    return r.rowCount;
  }

  async listMembers(grantId) {
    const r = await this.db.query(
      'SELECT student_user_id AS "studentUserId" FROM gallery_grant_members WHERE grant_id = $1',
      [grantId]
    );
    return r.rows;
  }

  // THE guard lookup. Deny-by-default: returns allowed:false unless a live ACCEPTED grant matches.
  async getViewerGrantAccess(viewer, hostSchoolId) {
    if (['TEACHER', 'SCHOOL_ADMIN'].includes(viewer.role)) {
      const r = await this.db.query(
        `SELECT id FROM gallery_grants
          WHERE host_school_id=$1 AND invited_teacher_user_id=$2 AND status='ACCEPTED' LIMIT 1`,
        [hostSchoolId, viewer.id]);
      if (r.rows[0]) { return { allowed: true, via: 'invited_teacher', grantId: r.rows[0].id }; }
    }
    if (viewer.role === 'STUDENT' && viewer.school_id) {
      const r = await this.db.query(
        `SELECT g.id FROM gallery_grants g
           JOIN gallery_grant_members m ON m.grant_id = g.id AND m.student_user_id = $2
          WHERE g.host_school_id=$1 AND g.invited_school_id=$3 AND g.status='ACCEPTED' LIMIT 1`,
        [hostSchoolId, viewer.id, viewer.school_id]);
      if (r.rows[0]) { return { allowed: true, via: 'enabled_student', grantId: r.rows[0].id }; }
    }
    return { allowed: false };
  }
}
module.exports = GalleryGrantModel;

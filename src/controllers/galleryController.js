'use strict';
const crypto = require('crypto');
const { pool } = require('../models/index');
const GalleryModel = require('../models/galleryModel');
const { auditGallery } = require('../middleware/galleryAccess');
const logger = require('../utils/logger');
const ValidationUtils = require('../utils/validationUtils');
const GalleryGrantModel = require('../models/galleryGrantModel');
const { EmailProvider } = require('../services/notificationService');
const GalleryCommentModel = require('../models/galleryCommentModel');
const model = new GalleryModel(pool);
const grants = new GalleryGrantModel(pool);
const comments = new GalleryCommentModel(pool);
const MAX_COMMENT_BODY = 2000;

const _smtpPort = Number.parseInt(process.env.SMTP_PORT, 10) || 587;
const emailProvider = new EmailProvider({
  provider: 'smtp',
  host: process.env.SMTP_HOST,
  port: _smtpPort,
  secure: _smtpPort === 465,
  user: process.env.SMTP_USER,
  password: process.env.SMTP_PASSWORD,
  fromEmail: process.env.MAIL_FROM || process.env.SMTP_USER
});

class GalleryController {
  // GET /api/gallery/:schoolId  (behind requireGalleryAccess)
  static async view(req, res, next) {
    try {
      const items = await model.getSchoolGalleryItems(req.params.schoolId);
      return res.json({ success: true, schoolId: req.params.schoolId, items });
    } catch (e) { return next(e); }
  }

  // PATCH /api/gallery/items/:id/share  (STUDENT only; own items)  Body: { sharedToGallery?, commentsAllowed? }
  // Security boundary: ownership (student_user_id = req.user.id in model), NOT live-role freshness — see addRoster for live-role pattern.
  static async setShare(req, res, next) {
    try {
      const { sharedToGallery, commentsAllowed } = req.body;
      if (sharedToGallery === undefined && commentsAllowed === undefined) {
        return res.status(400).json({ success: false, error: 'NO_FIELDS', message: 'Provide sharedToGallery and/or commentsAllowed.' });
      }
      for (const [k, v] of Object.entries({ sharedToGallery, commentsAllowed })) {
        if (v !== undefined && typeof v !== 'boolean') {
          return res.status(400).json({ success: false, error: 'INVALID_FIELD', message: `${k} must be boolean.` });
        }
      }
      const row = await model.setItemGalleryFlags(req.params.id, req.user.id, { sharedToGallery, commentsAllowed });
      if (!row) { return res.status(404).json({ success: false, error: 'ITEM_NOT_FOUND', message: 'Item not found or not yours.' }); }
      await auditGallery(req.user.id, 'COMPLIANCE', 'GALLERY_ITEM_SHARE_TOGGLED', row.id, { shared: row.shared_to_gallery, commentsAllowed: row.gallery_comments_allowed });
      return res.json({ success: true, item: { id: row.id, sharedToGallery: row.shared_to_gallery, commentsAllowed: row.gallery_comments_allowed } });
    } catch (e) { return next(e); }
  }

  // POST /api/gallery/roster { studentUserId }  (host TEACHER/SCHOOL_ADMIN)
  static async addRoster(req, res, next) {
    try {
      const viewer = await model.resolveViewer(req.user.id);
      if (!viewer || !['TEACHER', 'SCHOOL_ADMIN'].includes(viewer.role) || !viewer.school_id) {
        return res.status(403).json({ success: false, message: 'Only a teacher/admin can manage the roster.' });
      }
      const { studentUserId } = req.body;
      if (!studentUserId) { return res.status(400).json({ success: false, message: 'studentUserId required.' }); }
      const target = await model.resolveViewer(studentUserId);
      if (!target || target.role !== 'STUDENT' || target.school_id !== viewer.school_id) {
        return res.status(403).json({ success: false, error: 'CROSS_SCHOOL_DENIED', message: 'That student is not in your school.' });
      }
      await model.addToRoster(viewer.school_id, studentUserId, viewer.id);
      await auditGallery(viewer.id, 'COMPLIANCE', 'GALLERY_ROSTER_ADD', studentUserId, { schoolId: viewer.school_id });
      return res.status(201).json({ success: true });
    } catch (e) { return next(e); }
  }

  // DELETE /api/gallery/roster/:studentUserId  (host TEACHER/SCHOOL_ADMIN)
  static async removeRoster(req, res, next) {
    try {
      const viewer = await model.resolveViewer(req.user.id);
      if (!viewer || !['TEACHER', 'SCHOOL_ADMIN'].includes(viewer.role) || !viewer.school_id) {
        return res.status(403).json({ success: false, message: 'Only a teacher/admin can manage the roster.' });
      }
      const target = await model.resolveViewer(req.params.studentUserId);
      if (!target || target.role !== 'STUDENT' || target.school_id !== viewer.school_id) {
        return res.status(403).json({ success: false, error: 'CROSS_SCHOOL_DENIED', message: 'That student is not in your school.' });
      }
      await model.removeFromRoster(viewer.school_id, req.params.studentUserId);
      await auditGallery(viewer.id, 'COMPLIANCE', 'GALLERY_ROSTER_REMOVE', req.params.studentUserId, { schoolId: viewer.school_id });
      return res.json({ success: true });
    } catch (e) { return next(e); }
  }

  // ── Grant helpers ────────────────────────────────────────────────────────────

  static async _schoolBand(schoolId) {
    const r = await pool.query('SELECT grade_band FROM schools WHERE id=$1', [schoolId]);
    return r.rows[0] ? r.rows[0].grade_band : null;
  }

  static async _sendGrantInvite(toEmail, grantId, rawToken, hostBand) {
    const baseUrl = process.env.FRONTEND_URL || 'https://sag.live';
    const link = `${baseUrl}/gallery-invite.html?grant=${grantId}&token=${rawToken}`;
    const subject = 'You are invited to view a School Gallery';
    const text = `A teacher has invited your school (${hostBand} band) to view their student art gallery. Accept: ${link}`;
    const html = `<p>A teacher has invited your school (<b>${hostBand}</b> band) to view their student art gallery.</p><p><a href="${link}">Accept the invitation</a></p>`;
    await emailProvider.send(toEmail, subject, html, text);
  }

  // ── Grant endpoints ──────────────────────────────────────────────────────────

  // POST /api/gallery/grants  (host TEACHER)  { invitedEmail }
  static async invite(req, res, next) {
    try {
      const viewer = await model.resolveViewer(req.user.id);
      if (!viewer || viewer.role !== 'TEACHER' || !viewer.school_id) {
        return res.status(403).json({ success: false, message: 'Only a teacher can share the gallery.' });
      }
      const { invitedEmail } = req.body;
      if (!invitedEmail || !ValidationUtils.isValidEmail(invitedEmail)) {
        return res.status(400).json({ success: false, error: 'INVALID_EMAIL', message: 'A valid email is required.' });
      }
      const hostBand = await GalleryController._schoolBand(viewer.school_id);
      if (!hostBand) {
        return res.status(400).json({ success: false, error: 'SCHOOL_BAND_NOT_SET',
          message: 'Set your school\'s grade band before sharing the gallery.' });
      }
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const grant = await grants.createGrant({ hostSchoolId: viewer.school_id, hostBand,
        invitedEmail: invitedEmail.toLowerCase().trim(), invitedByUserId: viewer.id, tokenHash, expiresAt });
      let inviteSent = true;
      try { await GalleryController._sendGrantInvite(invitedEmail, grant.id, rawToken, hostBand); }
      catch (e) { inviteSent = false; logger.error('Gallery invite email failed', { error: e.message }); }
      await auditGallery(viewer.id, 'COMPLIANCE', 'GALLERY_INVITE_SENT', grant.id, { hostSchoolId: viewer.school_id, hostBand, inviteSent });
      return res.status(201).json({ success: true, grantId: grant.id, inviteSent });
    } catch (e) { return next(e); }
  }

  // POST /api/gallery/grants/:id/accept  (TEACHER, SCHOOL_ADMIN)  { token }
  static async acceptGrant(req, res, next) {
    try {
      const viewer = await model.resolveViewer(req.user.id);
      if (!viewer || !['TEACHER', 'SCHOOL_ADMIN'].includes(viewer.role) || !viewer.school_id) {
        return res.status(403).json({ success: false, message: 'Only a teacher/school admin can accept.' });
      }
      const { token } = req.body;
      if (!token) { return res.status(400).json({ success: false, message: 'token required.' }); }
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const grant = await grants.getPendingByTokenHash(tokenHash);
      if (!grant || grant.id !== req.params.id) {
        return res.status(404).json({ success: false, error: 'INVALID_TOKEN', message: 'Invitation not found or expired.' });
      }
      const invitedBand = await GalleryController._schoolBand(viewer.school_id);
      if (invitedBand !== grant.host_band) {
        await auditGallery(viewer.id, 'SECURITY', 'GALLERY_ACCEPT_BAND_MISMATCH', grant.id, { hostBand: grant.host_band, invitedBand });
        return res.status(409).json({ success: false, error: 'BAND_MISMATCH',
          message: `This gallery is for the ${grant.host_band} band; your school is ${invitedBand || 'unset'}. Only same-band schools may be invited.` });
      }
      const upd = await grants.acceptGrant(grant.id, { invitedSchoolId: viewer.school_id, invitedTeacherUserId: viewer.id });
      if (!upd) { return res.status(409).json({ success: false, error: 'ALREADY_RESOLVED', message: 'This invitation is no longer pending.' }); }
      await auditGallery(viewer.id, 'COMPLIANCE', 'GALLERY_INVITE_ACCEPTED', grant.id, { hostSchoolId: grant.host_school_id, invitedSchoolId: viewer.school_id });
      return res.json({ success: true, grantId: grant.id, status: 'ACCEPTED' });
    } catch (e) { return next(e); }
  }

  // POST /api/gallery/grants/:id/revoke  (host or invited side)
  static async revokeGrant(req, res, next) {
    try {
      const viewer = await model.resolveViewer(req.user.id);
      if (!viewer || !['TEACHER', 'SCHOOL_ADMIN'].includes(viewer.role)) {
        return res.status(403).json({ success: false, message: 'Not permitted.' });
      }
      const g = await grants.getGrantForRevoker(req.params.id);
      if (!g) { return res.status(404).json({ success: false, message: 'Grant not found.' }); }
      const isHost = viewer.school_id && viewer.school_id === g.host_school_id;
      const isInvited = viewer.id === g.invited_teacher_user_id || (viewer.school_id && viewer.school_id === g.invited_school_id);
      if (!isHost && !isInvited) { return res.status(403).json({ success: false, error: 'NOT_A_PARTY', message: 'You are not a party to this grant.' }); }
      const upd = await grants.revokeGrant(req.params.id, viewer.id);
      if (!upd) { return res.status(409).json({ success: false, message: 'Grant is not active.' }); }
      await auditGallery(viewer.id, 'COMPLIANCE', 'GALLERY_GRANT_REVOKED', req.params.id, { by: isHost ? 'host' : 'invited' });
      return res.json({ success: true, status: 'REVOKED' });
    } catch (e) { return next(e); }
  }

  // GET /api/gallery/grants  (host teacher/admin sees host grants; invited teacher sees theirs)
  static async listGrants(req, res, next) {
    try {
      const viewer = await model.resolveViewer(req.user.id);
      if (!viewer || !['TEACHER', 'SCHOOL_ADMIN'].includes(viewer.role)) {
        return res.status(403).json({ success: false, message: 'Not permitted.' });
      }
      const host = viewer.school_id ? await grants.listGrantsForHost(viewer.school_id) : [];
      const invited = await grants.listGrantsForInvitedTeacher(viewer.id);
      return res.json({ success: true, host, invited });
    } catch (e) { return next(e); }
  }

  // POST /api/gallery/grants/:id/members  (invited TEACHER)  { studentUserId }
  static async enableMember(req, res, next) {
    try {
      const viewer = await model.resolveViewer(req.user.id);
      const g = await grants.getGrantForRevoker(req.params.id);
      if (!g || g.status !== 'ACCEPTED' || !viewer || viewer.id !== g.invited_teacher_user_id) {
        return res.status(403).json({ success: false, message: 'Only the invited teacher can enable students.' });
      }
      const { studentUserId } = req.body;
      if (!studentUserId) { return res.status(400).json({ success: false, message: 'studentUserId required.' }); }
      const target = await model.resolveViewer(studentUserId);
      if (!target || target.role !== 'STUDENT' || target.school_id !== g.invited_school_id) {
        return res.status(403).json({ success: false, error: 'CROSS_SCHOOL_DENIED', message: 'That student is not in your school.' });
      }
      await grants.addMember(g.id, studentUserId, viewer.id);
      await auditGallery(viewer.id, 'COMPLIANCE', 'GALLERY_MEMBER_ENABLED', studentUserId, { grantId: g.id });
      return res.status(201).json({ success: true });
    } catch (e) { return next(e); }
  }

  // DELETE /api/gallery/grants/:id/members/:studentUserId  (invited TEACHER)
  static async disableMember(req, res, next) {
    try {
      const viewer = await model.resolveViewer(req.user.id);
      const g = await grants.getGrantForRevoker(req.params.id);
      if (!g || g.status !== 'ACCEPTED' || !viewer || viewer.id !== g.invited_teacher_user_id) {
        return res.status(403).json({ success: false, message: 'Only the invited teacher can disable students.' });
      }
      await grants.removeMember(g.id, req.params.studentUserId);
      await auditGallery(viewer.id, 'COMPLIANCE', 'GALLERY_MEMBER_DISABLED', req.params.studentUserId, { grantId: g.id });
      return res.json({ success: true });
    } catch (e) { return next(e); }
  }

  // ── Comments (Plan C: pre-moderated) ─────────────────────────────────────────

  // POST /api/gallery/items/:id/comments  (behind requireGalleryItemAccess)  { body }
  static async submitComment(req, res, next) {
    try {
      const viewer = req.galleryViewer;   // live row incl. grade_level (guard set it)
      const item = req.galleryItem;       // live gallery item (guard set it)
      if (viewer.role !== 'STUDENT') {
        return res.status(403).json({ success: false, error: 'STUDENTS_ONLY', message: 'Only students may comment in the gallery.' });
      }
      if (!item.gallery_comments_allowed) {
        return res.status(403).json({ success: false, error: 'COMMENTS_DISABLED', message: 'The artist has not enabled comments on this piece.' });
      }
      const crossSchool = viewer.school_id !== item.owner_school_id;
      if (crossSchool && (!viewer.grade_level || viewer.grade_level !== item.artist_grade)) {
        await auditGallery(viewer.id, 'SECURITY', 'GALLERY_COMMENT_DENIED', item.id,
          { reason: 'GRADE_MISMATCH', viewerGrade: viewer.grade_level || null, artistGrade: item.artist_grade || null });
        return res.status(403).json({ success: false, error: 'GRADE_MISMATCH',
          message: 'Cross-school comments are limited to students in the same grade as the artist.' });
      }
      const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
      if (body.length < 1 || body.length > MAX_COMMENT_BODY) {
        return res.status(400).json({ success: false, error: 'INVALID_BODY', message: `Comment must be 1–${MAX_COMMENT_BODY} characters.` });
      }
      const row = await comments.createComment({ portfolioItemId: item.id, authorUserId: viewer.id, authorSchoolId: viewer.school_id, body });
      await auditGallery(viewer.id, 'COMPLIANCE', 'GALLERY_COMMENT_SUBMITTED', row.id, { portfolioItemId: item.id, crossSchool });
      return res.status(201).json({ success: true, comment: { id: row.id, status: row.status } });
    } catch (e) { return next(e); }
  }

  // GET /api/gallery/items/:id/comments  (behind requireGalleryItemAccess) — APPROVED only
  static async listItemComments(req, res, next) {
    try {
      const rows = await comments.listApprovedForItem(req.galleryItem.id);
      return res.json({ success: true, comments: rows });
    } catch (e) { return next(e); }
  }
}
module.exports = GalleryController;

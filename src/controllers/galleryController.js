'use strict';
const { pool } = require('../models/index');
const GalleryModel = require('../models/galleryModel');
const { auditGallery } = require('../middleware/galleryAccess');
const model = new GalleryModel(pool);

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
}
module.exports = GalleryController;

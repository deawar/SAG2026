'use strict';
const { pool } = require('../models/index');
const GalleryModel = require('../models/galleryModel');
const model = new GalleryModel(pool);

async function auditGallery(actorId, category, actionType, resourceId, details) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action_category, action_type, resource_type, resource_id, action_details)
       VALUES ($1,$2,$3,'SCHOOL_GALLERY',$4,$5)`,
      [actorId, category, actionType, resourceId, details ? JSON.stringify(details) : null]
    );
  } catch (e) { /* best-effort audit; never block the request */ }
}

// Sole authorization path for a school's gallery. Deny-by-default.
async function requireGalleryAccess(req, res, next) {
  try {
    const schoolId = req.params.schoolId;
    const viewer = await model.resolveViewer(req.user.id); // LIVE role + school_id (JWT is stale after transfer)
    if (!viewer) { return res.status(401).json({ success: false, message: 'Account not found' }); }

    if (viewer.role === 'SITE_ADMIN') {
      await auditGallery(viewer.id, 'COMPLIANCE', 'GALLERY_CROSS_SCHOOL_VIEW', schoolId, { via: 'site_admin' });
      req.galleryViewer = viewer; return next();
    }
    if (viewer.school_id && viewer.school_id === schoolId) {
      req.galleryViewer = viewer; return next();
    }
    // --- Plan B inserts the accepted-grant + enablement branch HERE, before the deny ---
    await auditGallery(viewer.id, 'SECURITY', 'GALLERY_ACCESS_DENIED', schoolId, { viewerSchool: viewer.school_id, role: viewer.role });
    return res.status(403).json({ success: false, error: 'GALLERY_ACCESS_DENIED', message: "You do not have access to this school's gallery." });
  } catch (err) { return next(err); }
}

module.exports = { requireGalleryAccess, auditGallery, model };

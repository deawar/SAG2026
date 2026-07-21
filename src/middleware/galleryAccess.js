'use strict';
const { pool } = require('../models/index');
const GalleryModel = require('../models/galleryModel');
const model = new GalleryModel(pool);
const GalleryGrantModel = require('../models/galleryGrantModel');
const grants = new GalleryGrantModel(pool);

async function auditGallery(actorId, category, actionType, resourceId, details) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action_category, action_type, resource_type, resource_id, action_details)
       VALUES ($1,$2,$3,'SCHOOL_GALLERY',$4,$5)`,
      [actorId, category, actionType, resourceId, details ? JSON.stringify(details) : null]
    );
  } catch (e) { console.error('[gallery-audit] failed to write audit log:', e.message); }
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
    // External access via an ACCEPTED cross-school grant (deny-by-default: only an
    // ACCEPTED grant with a bound invited teacher or an enablement row grants access).
    const access = await grants.getViewerGrantAccess(viewer, schoolId);
    if (access.allowed === true) {
      await auditGallery(viewer.id, 'COMPLIANCE', 'GALLERY_CROSS_SCHOOL_VIEW', schoolId, { via: access.via, grantId: access.grantId });
      req.galleryViewer = viewer; req.galleryGrant = access; return next();
    }
    await auditGallery(viewer.id, 'SECURITY', 'GALLERY_ACCESS_DENIED', schoolId, { viewerSchool: viewer.school_id, role: viewer.role });
    return res.status(403).json({ success: false, error: 'GALLERY_ACCESS_DENIED', message: "You do not have access to this school's gallery." });
  } catch (err) { return next(err); }
}

// Item-level guard for comment routes: resolve the item's HOST school (owner's
// live school), then delegate to requireGalleryAccess — authorization stays a
// single code path. Items outside live gallery content 404 (no existence oracle).
async function requireGalleryItemAccess(req, res, next) {
  try {
    const item = await model.getCommentableItem(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'ITEM_NOT_IN_GALLERY', message: 'Item not found in any gallery.' });
    }
    req.galleryItem = item;
    req.params.schoolId = item.owner_school_id;
    return requireGalleryAccess(req, res, next);
  } catch (err) { return next(err); }
}

module.exports = { requireGalleryAccess, requireGalleryItemAccess, auditGallery, model };

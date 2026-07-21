'use strict';
const express = require('express');
const router = express.Router();
const GalleryController = require('../controllers/galleryController');
const { requireGalleryAccess, requireGalleryItemAccess } = require('../middleware/galleryAccess');
const { verifyRole } = require('../middleware/authMiddleware');

// Grant routes MUST come before /:schoolId to avoid being captured by the param
router.get('/grants', verifyRole('TEACHER', 'SCHOOL_ADMIN'), GalleryController.listGrants);
router.post('/grants', verifyRole('TEACHER'), GalleryController.invite);
router.post('/grants/:id/accept', verifyRole('TEACHER', 'SCHOOL_ADMIN'), GalleryController.acceptGrant);
router.post('/grants/:id/revoke', verifyRole('TEACHER', 'SCHOOL_ADMIN'), GalleryController.revokeGrant);
router.post('/grants/:id/members', verifyRole('TEACHER'), GalleryController.enableMember);
router.delete('/grants/:id/members/:studentUserId', verifyRole('TEACHER'), GalleryController.disableMember);

// Comment routes (Plan C) — item guard resolves the host school then delegates
router.get('/items/:id/comments', requireGalleryItemAccess, GalleryController.listItemComments);
router.post('/items/:id/comments', requireGalleryItemAccess, GalleryController.submitComment);

router.get('/:schoolId', requireGalleryAccess, GalleryController.view);
router.patch('/items/:id/share', verifyRole('STUDENT'), GalleryController.setShare);
router.post('/roster', verifyRole('TEACHER', 'SCHOOL_ADMIN'), GalleryController.addRoster);
router.delete('/roster/:studentUserId', verifyRole('TEACHER', 'SCHOOL_ADMIN'), GalleryController.removeRoster);

module.exports = router;

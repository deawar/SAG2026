'use strict';
const express = require('express');
const router = express.Router();
const GalleryController = require('../controllers/galleryController');
const { requireGalleryAccess } = require('../middleware/galleryAccess');
const { verifyRole } = require('../middleware/authMiddleware');

router.get('/:schoolId', requireGalleryAccess, GalleryController.view);
router.patch('/items/:id/share', verifyRole('STUDENT'), GalleryController.setShare);
router.post('/roster', verifyRole('TEACHER', 'SCHOOL_ADMIN'), GalleryController.addRoster);
router.delete('/roster/:studentUserId', verifyRole('TEACHER', 'SCHOOL_ADMIN'), GalleryController.removeRoster);

module.exports = router;

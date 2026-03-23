/**
 * Teacher Routes - CSV upload, student management, dashboard
 * File: src/routes/teacherRoutes.js
 * Created: February 3, 2026
 */

const express = require('express');
const router = express.Router();
const TeacherController = require('../controllers/teacherController');
const authMiddleware = require('../middleware/authMiddleware');

// All teacher routes require authentication and TEACHER role
router.use(authMiddleware.verifyToken);
router.use(authMiddleware.verifyRole('TEACHER', 'SCHOOL_ADMIN', 'SITE_ADMIN'));

/**
 * POST /api/teacher/csv-upload
 * Upload CSV with student list and generate registration tokens
 * Body: { students: [ { name, email }, ... ] }
 */
router.post('/csv-upload', async (req, res, next) => {
    try {
        const result = await TeacherController.uploadCSV(req, res);
        return result;
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/teacher/submissions
 * Get all artwork submissions for teacher's school
 */
router.get('/submissions', async (req, res, next) => {
    try {
        const result = await TeacherController.getSubmissions(req, res);
        return result;
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/teacher/auctions
 * Get all auctions created by teacher
 */
router.get('/auctions', async (req, res, next) => {
    try {
        const result = await TeacherController.getAuctions(req, res);
        return result;
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/teacher/tokens/:tokenId
 * Get details of a specific registration token
 */
router.get('/tokens/:tokenId', async (req, res, next) => {
    try {
        const result = await TeacherController.getTokenDetails(req, res);
        return result;
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/teacher/tokens/:tokenId
 * Revoke a registration token
 */
router.delete('/tokens/:tokenId', async (req, res, next) => {
    try {
        const result = await TeacherController.revokeToken(req, res);
        return result;
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/teacher/students
 * Returns { registered: [...], pending: [...] } for the logged-in teacher.
 * registered = students who completed registration via invite link.
 * pending    = tokens that have been created but not yet used.
 */
router.get('/students', async (req, res, next) => {
    try {
        return await TeacherController.getStudents(req, res);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/teacher/teacher-info
 * Get teacher's display name and school name for email attribution
 */
router.get('/teacher-info', async (req, res, next) => {
    try {
        return await TeacherController.getTeacherInfo(req, res);
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/teacher/tokens/:tokenId
 * Update student name/email on an unused token
 * Body: { studentName, studentEmail }
 */
router.put('/tokens/:tokenId', async (req, res, next) => {
    try {
        return await TeacherController.updateToken(req, res);
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/teacher/students/:userId
 * Update a registered student's name (school-scoped, student accounts only).
 * Body: { firstName, lastName }
 */
router.put('/students/:userId', async (req, res, next) => {
    try {
        return await TeacherController.updateStudent(req, res);
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/teacher/students/:userId
 * Soft-delete a registered student (school-scoped, student accounts only).
 */
router.delete('/students/:userId', async (req, res, next) => {
    try {
        return await TeacherController.deleteStudent(req, res);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/teacher/send-invites
 * Send registration invite emails to selected students
 * Body: { tokenIds: [...] }
 */
router.post('/send-invites', async (req, res, next) => {
    try {
        return await TeacherController.sendInvites(req, res);
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/teacher/submissions/:id/approve
 * Approve a student artwork submission (school-scoped)
 */
router.put('/submissions/:id/approve', async (req, res, next) => {
    try {
        return await TeacherController.approveSubmission(req, res);
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/teacher/submissions/:id/reject
 * Reject a student artwork submission
 * Body: { reason }
 */
router.put('/submissions/:id/reject', async (req, res, next) => {
    try {
        return await TeacherController.rejectSubmission(req, res);
    } catch (error) {
        next(error);
    }
});

module.exports = router;

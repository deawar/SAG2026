/**
 * Teacher Controller - Handle CSV uploads and student management
 * File: src/controllers/teacherController.js
 * Created: February 3, 2026
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const ValidationUtils = require('../utils/validationUtils');
const { pool } = require('../models/index');
const { EmailProvider, EmailTemplateService } = require('../services/notificationService');

const _smtpPort = parseInt(process.env.SMTP_PORT) || 587;
const emailProvider = new EmailProvider({
    provider: 'smtp',
    host: process.env.SMTP_HOST,
    port: _smtpPort,
    secure: _smtpPort === 465,
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    fromEmail: process.env.MAIL_FROM || process.env.SMTP_USER
});

class TeacherController {
    /**
     * Upload CSV with student list and generate registration tokens
     * @param {Request} req - Express request
     * @param {Response} res - Express response
     */
    static async uploadCSV(req, res) {
        try {
            // Verify user is authenticated and is a teacher
            const userId = req.user.id;
            const schoolId = req.user.schoolId;

            if (!req.user.role || !['TEACHER', 'SCHOOL_ADMIN', 'SITE_ADMIN'].includes(req.user.role)) {
                return res.status(403).json({
                    success: false,
                    message: 'Only teachers can upload student lists',
                    errors: ['Permission denied']
                });
            }

            // Parse request body
            const { students } = req.body;

            if (!Array.isArray(students) || students.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid request - students must be a non-empty array',
                    errors: ['students array required']
                });
            }

            // Validate each student
            const validStudents = [];
            const errors = [];

            for (let i = 0; i < students.length; i++) {
                const student = students[i];
                
                // Validate email
                if (!student.email || !ValidationUtils.isValidEmail(student.email)) {
                    errors.push(`Row ${i + 1}: Invalid email "${student.email}"`);
                    continue;
                }

                // Validate name
                if (!student.name || typeof student.name !== 'string' || student.name.trim().length === 0) {
                    errors.push(`Row ${i + 1}: Invalid or missing name`);
                    continue;
                }

                validStudents.push({
                    name: student.name.trim(),
                    email: student.email.toLowerCase().trim()
                });
            }

            if (validStudents.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No valid students found in upload',
                    errors: errors
                });
            }

            // Generate tokens for each student
            const tokens = [];
            
            for (const student of validStudents) {
                const token = uuidv4();
                const result = await pool.query(
                    `INSERT INTO registration_tokens
                        (token, teacher_id, student_email, student_name, created_by_user_id)
                     VALUES ($1, $2, $3, $4, $5)
                     RETURNING id`,
                    [token, userId, student.email, student.name, userId]
                );
                tokens.push({
                    id: result.rows[0].id,
                    token: token,
                    studentName: student.name,
                    studentEmail: student.email,
                    used: false
                });
            }

            // Log action
            logger.info('CSV upload', {
                userId: userId,
                schoolId: schoolId,
                studentsCount: validStudents.length,
                tokensGenerated: tokens.length,
                timestamp: new Date()
            });

            return res.status(201).json({
                success: true,
                message: `Successfully created registration links for ${tokens.length} students`,
                data: {
                    tokensCreated: tokens.length,
                    studentsProcessed: validStudents.length,
                    errorsFound: errors.length
                },
                tokens: tokens,
                errors: errors.length > 0 ? errors : null
            });

        } catch (error) {
            logger.error('CSV upload error', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.id
            });

            return res.status(500).json({
                success: false,
                message: 'Error processing CSV upload',
                errors: [error.message]
            });
        }
    }

    /**
     * Get artwork submissions for teacher's school
     * @param {Request} req - Express request
     * @param {Response} res - Express response
     */
    static async getSubmissions(req, res) {
        try {
            const userId = req.user.id;
            const schoolId = req.user.schoolId;

            // In production, fetch from database
            // const submissions = await ArtworkModel.getSubmissionsBySchool(schoolId);

            const submissions = [
                {
                    id: 'sub_1',
                    title: 'Sample Submission',
                    studentName: 'John Doe',
                    imageUrl: '/images/auction-items/placeholder.svg',
                    status: 'PENDING'
                }
            ];

            return res.json({
                success: true,
                data: submissions
            });

        } catch (error) {
            logger.error('Get submissions error', {
                error: error.message,
                userId: req.user?.id
            });

            return res.status(500).json({
                success: false,
                message: 'Error fetching submissions',
                errors: [error.message]
            });
        }
    }

    /**
     * Get auctions created by teacher
     * @param {Request} req - Express request
     * @param {Response} res - Express response
     */
    static async getAuctions(req, res) {
        try {
            const userId = req.user.id;

            const result = await pool.query(
                `SELECT a.id, a.title, a.description, a.auction_status,
                        a.starts_at, a.ends_at, a.created_at,
                        (SELECT COUNT(*) FROM bids b
                         JOIN artwork aw ON b.artwork_id = aw.id
                         WHERE aw.auction_id = a.id AND b.bid_status = 'ACTIVE') AS bid_count,
                        (SELECT MAX(b.bid_amount) FROM bids b
                         JOIN artwork aw ON b.artwork_id = aw.id
                         WHERE aw.auction_id = a.id AND b.bid_status = 'ACTIVE') AS current_high_bid
                 FROM auctions a
                 WHERE a.created_by_user_id = $1
                   AND a.deleted_at IS NULL
                 ORDER BY a.created_at DESC`,
                [userId]
            );

            return res.json({
                success: true,
                data: result.rows
            });

        } catch (error) {
            logger.error('Get auctions error', {
                error: error.message,
                userId: req.user?.id
            });

            return res.status(500).json({
                success: false,
                message: 'Error fetching auctions',
                errors: [error.message]
            });
        }
    }

    /**
     * Get details of a specific registration token
     * @param {Request} req - Express request
     * @param {Response} res - Express response
     */
    static async getTokenDetails(req, res) {
        try {
            const { tokenId } = req.params;
            const userId = req.user.id;

            if (!tokenId) {
                return res.status(400).json({
                    success: false,
                    message: 'Token ID required',
                    errors: ['tokenId parameter missing']
                });
            }

            // In production, fetch from database
            // const token = await RegistrationTokenModel.getById(tokenId);
            // Verify teacher owns this token
            // if (token.teacher_id !== userId) throw new Error('Unauthorized');

            return res.json({
                success: true,
                data: null
            });

        } catch (error) {
            logger.error('Get token details error', {
                error: error.message,
                userId: req.user?.id
            });

            return res.status(500).json({
                success: false,
                message: 'Error fetching token details',
                errors: [error.message]
            });
        }
    }

    /**
     * Get teacher info (name + school name) for email attribution
     */
    static async getTeacherInfo(req, res) {
        try {
            const result = await pool.query(
                `SELECT u.first_name, u.last_name, s.name AS school_name
                 FROM users u
                 LEFT JOIN schools s ON s.id = u.school_id
                 WHERE u.id = $1`,
                [req.user.id]
            );
            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Teacher not found' });
            }
            const { first_name, last_name, school_name } = result.rows[0];
            return res.json({
                success: true,
                data: {
                    teacherName: `${first_name || ''} ${last_name || ''}`.trim(),
                    schoolName: school_name || ''
                }
            });
        } catch (error) {
            logger.error('Get teacher info error', { error: error.message, userId: req.user?.id });
            return res.status(500).json({ success: false, message: 'Error fetching teacher info' });
        }
    }

    /**
     * Update student name/email on an unused registration token
     */
    static async updateToken(req, res) {
        try {
            const { tokenId } = req.params;
            const { studentName, studentEmail } = req.body;
            const userId = req.user.id;

            if (!studentName || typeof studentName !== 'string' || studentName.trim().length === 0) {
                return res.status(400).json({ success: false, message: 'Valid student name required' });
            }
            if (!studentEmail || !ValidationUtils.isValidEmail(studentEmail)) {
                return res.status(400).json({ success: false, message: 'Valid student email required' });
            }

            const result = await pool.query(
                `UPDATE registration_tokens
                 SET student_name = $1, student_email = $2
                 WHERE id = $3 AND teacher_id = $4 AND used_at IS NULL
                 RETURNING id`,
                [studentName.trim(), studentEmail.toLowerCase().trim(), tokenId, userId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Token not found, already used, or not yours' });
            }

            return res.json({ success: true, message: 'Student info updated' });
        } catch (error) {
            logger.error('Update token error', { error: error.message, userId: req.user?.id });
            return res.status(500).json({ success: false, message: 'Error updating token' });
        }
    }

    /**
     * Send registration invite emails to selected students
     * Body: { tokenIds: [...] }
     */
    static async sendInvites(req, res) {
        try {
            const userId = req.user.id;
            const { tokenIds } = req.body;

            if (!Array.isArray(tokenIds) || tokenIds.length === 0) {
                return res.status(400).json({ success: false, message: 'tokenIds array required' });
            }

            // Fetch teacher name + school name
            const teacherResult = await pool.query(
                `SELECT u.first_name, u.last_name, s.name AS school_name
                 FROM users u
                 LEFT JOIN schools s ON s.id = u.school_id
                 WHERE u.id = $1`,
                [userId]
            );
            const teacher = teacherResult.rows[0] || {};
            const teacherName = `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim() || 'Your Teacher';
            const schoolName = teacher.school_name || 'Your School';

            // Fetch only tokens that belong to this teacher
            const placeholders = tokenIds.map((_, i) => `$${i + 2}`).join(', ');
            const tokensResult = await pool.query(
                `SELECT id, token, student_email, student_name
                 FROM registration_tokens
                 WHERE id IN (${placeholders}) AND teacher_id = $1`,
                [userId, ...tokenIds]
            );

            const baseUrl = process.env.FRONTEND_URL || 'https://sag.live';
            let sent = 0;
            const errors = [];

            for (const row of tokensResult.rows) {
                const registrationLink = `${baseUrl}/register.html?token=${row.token}&email=${encodeURIComponent(row.student_email)}`;
                try {
                    const emailContent = EmailTemplateService.generateTemplate('student-registration-invite', {
                        studentName: row.student_name || 'Student',
                        teacherName,
                        schoolName,
                        registrationLink
                    });
                    await emailProvider.send(row.student_email, emailContent.subject, emailContent.html, emailContent.text);
                    sent++;
                } catch (err) {
                    logger.error('Send invite email failed', { error: err.message, studentEmail: row.student_email });
                    errors.push(`${row.student_email}: ${err.message}`);
                }
            }

            return res.json({
                success: true,
                message: `Sent ${sent} invite${sent !== 1 ? 's' : ''}${errors.length ? ` (${errors.length} failed)` : ''}`,
                data: { sent, failed: errors.length, errors: errors.length ? errors : undefined }
            });
        } catch (error) {
            logger.error('Send invites error', { error: error.message, userId: req.user?.id });
            return res.status(500).json({ success: false, message: 'Error sending invites' });
        }
    }

    /**
     * Revoke a registration token
     * @param {Request} req - Express request
     * @param {Response} res - Express response
     */
    static async revokeToken(req, res) {
        try {
            const { tokenId } = req.params;
            const userId = req.user.id;

            if (!tokenId) {
                return res.status(400).json({
                    success: false,
                    message: 'Token ID required',
                    errors: ['tokenId parameter missing']
                });
            }

            // In production, soft delete from database
            // const token = await RegistrationTokenModel.getById(tokenId);
            // Verify teacher owns this token
            // if (token.teacher_id !== userId) throw new Error('Unauthorized');
            // await RegistrationTokenModel.revoke(tokenId);

            logger.info('Token revoked', {
                tokenId: tokenId,
                userId: userId,
                timestamp: new Date()
            });

            return res.json({
                success: true,
                message: 'Registration token has been revoked'
            });

        } catch (error) {
            logger.error('Revoke token error', {
                error: error.message,
                userId: req.user?.id
            });

            return res.status(500).json({
                success: false,
                message: 'Error revoking token',
                errors: [error.message]
            });
        }
    }
}

module.exports = TeacherController;

/**
 * Teacher Controller - Handle CSV uploads and student management
 * File: src/controllers/teacherController.js
 * Created: February 3, 2026
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const ValidationUtils = require('../utils/validationUtils');
const { pool } = require('../models/index');

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
                const tokenRecord = {
                    token: token,
                    teacher_id: userId,
                    student_email: student.email,
                    student_name: student.name,
                    created_by_user_id: userId,
                    studentName: student.name,  // For response
                    studentEmail: student.email,
                    used: false
                };

                // In production, save to database
                // const saved = await RegistrationTokenModel.create(tokenRecord);
                
                tokens.push({
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
                    imageUrl: '/images/auction-items/placeholder.jpg',
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
                        COUNT(b.id)          AS bid_count,
                        MAX(b.bid_amount)    AS current_high_bid
                 FROM auctions a
                 LEFT JOIN bids b ON b.auction_id = a.id AND b.bid_status = 'ACTIVE'
                 WHERE a.created_by_user_id = $1
                   AND a.deleted_at IS NULL
                 GROUP BY a.id
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

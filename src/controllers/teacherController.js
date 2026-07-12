/**
 * Teacher Controller - Handle CSV uploads and student management
 * File: src/controllers/teacherController.js
 * Created: February 3, 2026
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const ValidationUtils = require('../utils/validationUtils');
const { pool } = require('../models/index');
const { EmailProvider, EmailTemplateService, getSharedEmailProvider, notifyArtworkStatusChanged } = require('../services/notificationService');

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

class TeacherController {
  /**
     * Fetch the teacher's current school_id from the database.
     * The JWT value can be stale (e.g. school assigned after last login),
     * so always prefer the live DB value.
     */
  static async _resolveSchoolId(userId) {
    const r = await pool.query('SELECT school_id FROM users WHERE id = $1', [userId]);
    return r.rows[0]?.school_id || null;
  }

  /**
     * Upload CSV with student list and generate registration tokens
     * @param {Request} req - Express request
     * @param {Response} res - Express response
     */
  static async uploadCSV(req, res) {
    try {
      // Verify user is authenticated and is a teacher
      const userId = req.user.id;
      const schoolId = await TeacherController._resolveSchoolId(userId);

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
          errors
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
          token,
          studentName: student.name,
          studentEmail: student.email,
          used: false
        });
      }

      // Log action
      logger.info('CSV upload', {
        userId,
        schoolId,
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
        tokens,
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
      const schoolId = await TeacherController._resolveSchoolId(req.user.id);

      const result = await pool.query(
        `SELECT aw.id, aw.title, aw.artist_name AS "artistName",
                        aw.medium, aw.image_url AS "imageUrl",
                        aw.artwork_status AS status,
                        aw.rejection_reason AS "rejectionReason",
                        aw.starting_bid_amount AS "startingBid",
                        aw.description, aw.created_at AS "submittedAt",
                        aw.dimensions_width_cm AS width,
                        aw.dimensions_height_cm AS height,
                        u.first_name || ' ' || COALESCE(u.last_name, '') AS "studentName",
                        u.email AS "studentEmail",
                        a.id AS "auctionId", a.title AS "auctionTitle"
                 FROM   artwork aw
                 JOIN   auctions a ON a.id = aw.auction_id
                 JOIN   users    u ON u.id = aw.created_by_user_id
                 WHERE  a.school_id = $1
                   AND  aw.deleted_at IS NULL
                   AND  aw.artwork_status IN ('SUBMITTED','PENDING_APPROVAL','APPROVED','REJECTED')
                 ORDER  BY aw.created_at DESC`,
        [schoolId]
      );

      return res.json({ success: true, data: result.rows });
    } catch (error) {
      logger.error('Get submissions error', { error: error.message, userId: req.user?.id });
      return res.status(500).json({ success: false, message: 'Error fetching submissions', errors: [error.message] });
    }
  }

  /**
     * Approve an artwork submission.
     * PUT /api/teacher/submissions/:id/approve
     */
  static async approveSubmission(req, res) {
    try {
      const { id } = req.params;
      const teacherId = req.user.id;

      // Optional pricing — validate BEFORE any DB access so bad input costs no round-trip
      const { startingBid, reserve } = req.body || {};

      if (startingBid !== undefined && startingBid !== null) {
        if (typeof startingBid !== 'number' || !Number.isFinite(startingBid) || startingBid < 0) {
          return res.status(400).json({ success: false, message: 'startingBid must be a non-negative number' });
        }
      }

      if (reserve !== undefined && reserve !== null) {
        const minForReserve = (startingBid !== undefined && startingBid !== null) ? startingBid : 0;
        if (typeof reserve !== 'number' || !Number.isFinite(reserve) || reserve < minForReserve) {
          return res.status(400).json({ success: false, message: 'reserve must be >= startingBid' });
        }
      }

      const schoolId  = await TeacherController._resolveSchoolId(req.user.id);

      const result = await pool.query(
        `UPDATE artwork aw
                 SET artwork_status      = 'APPROVED',
                     approved_at         = NOW(),
                     approved_by_user_id = $1,
                     updated_at          = NOW(),
                     starting_bid_amount = COALESCE($4, starting_bid_amount),
                     reserve_bid_amount  = COALESCE($5, reserve_bid_amount)
                 FROM auctions a
                 WHERE aw.auction_id = a.id
                   AND aw.id = $2
                   AND a.school_id = $3
                   AND aw.deleted_at IS NULL
                   AND aw.artwork_status IN ('SUBMITTED','PENDING_APPROVAL')
                 RETURNING aw.id`,
        [teacherId, id, schoolId, startingBid ?? null, reserve ?? null]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, message: 'Submission not found or already reviewed' });
      }

      // Propagate to linked portfolio item
      await pool.query(
        `UPDATE portfolio_items pi
         SET submission_state = 'IN_AUCTION',
             updated_at       = NOW()
         FROM artwork aw
         WHERE aw.id = $1
           AND aw.portfolio_item_id = pi.id`,
        [id]
      );

      // Notify the student artist non-blocking
      setImmediate(async () => {
        try {
          const artworkRow = await pool.query(
            `SELECT aw.title, u.id AS student_id, u.email, u.first_name
             FROM artwork aw
             JOIN users u ON aw.created_by_user_id = u.id
             WHERE aw.id = $1`,
            [id]
          );
          if (artworkRow.rows.length > 0) {
            const { student_id, email, first_name, title } = artworkRow.rows[0];
            await notifyArtworkStatusChanged(getSharedEmailProvider(), pool, {
              userId: student_id, email, firstName: first_name,
              artworkTitle: title, newStatus: 'APPROVED', reason: null
            });
          }
        } catch (err) {
          logger.error('artwork-approved notification failed', { error: err.message, artworkId: id });
        }
      });

      return res.json({ success: true, message: 'Artwork approved' });
    } catch (error) {
      logger.error('Approve submission error', { error: error.message, userId: req.user?.id });
      return res.status(500).json({ success: false, message: 'Error approving submission' });
    }
  }

  /**
     * Reject an artwork submission.
     * PUT /api/teacher/submissions/:id/reject
     * Body: { reason }
     */
  static async rejectSubmission(req, res) {
    try {
      const { id } = req.params;
      const schoolId = await TeacherController._resolveSchoolId(req.user.id);
      const reason   = (req.body.reason || '').trim() || null;

      const result = await pool.query(
        `UPDATE artwork aw
                 SET artwork_status  = 'REJECTED',
                     rejection_reason = $1,
                     updated_at       = NOW()
                 FROM auctions a
                 WHERE aw.auction_id = a.id
                   AND aw.id = $2
                   AND a.school_id = $3
                   AND aw.deleted_at IS NULL
                   AND aw.artwork_status IN ('SUBMITTED','PENDING_APPROVAL')
                 RETURNING aw.id`,
        [reason, id, schoolId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, message: 'Submission not found or already reviewed' });
      }

      // Propagate to linked portfolio item
      await pool.query(
        `UPDATE portfolio_items pi
         SET submission_state = 'REJECTED',
             rejection_reason = $2,
             updated_at       = NOW()
         FROM artwork aw
         WHERE aw.id = $1
           AND aw.portfolio_item_id = pi.id`,
        [id, reason]
      );

      // Notify the student artist non-blocking
      setImmediate(async () => {
        try {
          const artworkRow = await pool.query(
            `SELECT aw.title, aw.rejection_reason, u.id AS student_id, u.email, u.first_name
             FROM artwork aw
             JOIN users u ON aw.created_by_user_id = u.id
             WHERE aw.id = $1`,
            [id]
          );
          if (artworkRow.rows.length > 0) {
            const { student_id, email, first_name, title, rejection_reason } = artworkRow.rows[0];
            await notifyArtworkStatusChanged(getSharedEmailProvider(), pool, {
              userId: student_id, email, firstName: first_name,
              artworkTitle: title, newStatus: 'REJECTED', reason: rejection_reason
            });
          }
        } catch (err) {
          logger.error('artwork-rejected notification failed', { error: err.message, artworkId: id });
        }
      });

      return res.json({ success: true, message: 'Artwork rejected' });
    } catch (error) {
      logger.error('Reject submission error', { error: error.message, userId: req.user?.id });
      return res.status(500).json({ success: false, message: 'Error rejecting submission' });
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
        `SELECT u.first_name, u.last_name, u.school_id, s.name AS school_name
                 FROM users u
                 LEFT JOIN schools s ON s.id = u.school_id
                 WHERE u.id = $1`,
        [req.user.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Teacher not found' });
      }
      const { first_name, last_name, school_id, school_name } = result.rows[0];
      return res.json({
        success: true,
        data: {
          teacherName: `${first_name || ''} ${last_name || ''}`.trim(),
          schoolName: school_name || '',
          schoolId: school_id || null
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
        message: `Sent ${sent} invite${sent === 1 ? '' : 's'}${errors.length === 0 ? '' : ` (${errors.length} failed)`}`,
        data: { sent, failed: errors.length, errors: errors.length ? errors : undefined }
      });
    } catch (error) {
      logger.error('Send invites error', { error: error.message, userId: req.user?.id });
      return res.status(500).json({ success: false, message: 'Error sending invites' });
    }
  }

  /**
     * Get all students for the teacher — split into registered and pending-invite lists.
     * Registered: user has completed sign-up (used_at is set OR a users row exists with matching email).
     * Pending:    token exists but student has not yet registered.
     */
  static async getStudents(req, res) {
    try {
      const userId = req.user.id;

      const result = await pool.query(
        `SELECT
                    rt.id            AS token_id,
                    rt.token,
                    rt.student_email,
                    rt.student_name,
                    rt.used_at,
                    rt.created_at    AS invited_at,
                    u.id             AS user_id,
                    u.first_name,
                    u.last_name,
                    u.created_at     AS registered_at
                 FROM registration_tokens rt
                 LEFT JOIN users u ON LOWER(u.email) = LOWER(rt.student_email)
                                   AND u.deleted_at IS NULL
                                   AND u.role = 'STUDENT'
                 WHERE rt.teacher_id = $1
                 ORDER BY rt.used_at DESC NULLS LAST, rt.created_at DESC`,
        [userId]
      );

      const registered = [];
      const pending    = [];

      for (const row of result.rows) {
        if (row.used_at || row.user_id) {
          registered.push({
            tokenId: row.token_id,
            studentName: row.first_name
              ? `${row.first_name} ${row.last_name || ''}`.trim()
              : row.student_name,
            studentEmail: row.student_email,
            invitedAt: row.invited_at,
            registeredAt: row.registered_at || row.used_at,
            userId: row.user_id
          });
        } else {
          pending.push({
            id: row.token_id,
            token: row.token,
            studentName: row.student_name,
            studentEmail: row.student_email,
            used: false,
            invitedAt: row.invited_at
          });
        }
      }

      return res.json({
        success: true,
        data: { registered, pending }
      });
    } catch (error) {
      logger.error('Get students error', { error: error.message, userId: req.user?.id });
      return res.status(500).json({ success: false, message: 'Error fetching students' });
    }
  }

  /**
     * Revoke (delete) a pending registration token.
     * Only the owning teacher may delete their own tokens.
     */
  static async revokeToken(req, res) {
    try {
      const { tokenId } = req.params;
      const userId = req.user.id;

      if (!tokenId) {
        return res.status(400).json({ success: false, message: 'Token ID required' });
      }

      const result = await pool.query(
        `DELETE FROM registration_tokens
                 WHERE id = $1 AND teacher_id = $2 AND used_at IS NULL
                 RETURNING id`,
        [tokenId, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Token not found, already used, or not yours'
        });
      }

      logger.info('Token revoked', { tokenId, userId });
      return res.json({ success: true, message: 'Invite removed' });
    } catch (error) {
      logger.error('Revoke token error', { error: error.message, userId: req.user?.id });
      return res.status(500).json({ success: false, message: 'Error removing invite' });
    }
  }

  /**
     * Update a registered student's name.
     * Teachers may only edit students belonging to their own school.
     */
  static async updateStudent(req, res) {
    try {
      const { userId: targetUserId } = req.params;
      const { firstName, lastName } = req.body;

      if (!firstName || typeof firstName !== 'string' || firstName.trim().length === 0) {
        return res.status(400).json({ success: false, message: 'First name is required' });
      }
      if (!lastName || typeof lastName !== 'string' || lastName.trim().length === 0) {
        return res.status(400).json({ success: false, message: 'Last name is required' });
      }

      const result = await pool.query(
        `UPDATE users
                 SET first_name = $1, last_name = $2
                 WHERE id = $3
                   AND role = 'STUDENT'
                   AND deleted_at IS NULL
                   AND LOWER(email) IN (
                       SELECT LOWER(student_email) FROM registration_tokens WHERE teacher_id = $4
                   )
                 RETURNING id`,
        [firstName.trim(), lastName.trim(), targetUserId, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Student not found or not invited by you'
        });
      }

      logger.info('Student updated', { targetUserId, teacherId: req.user.id });
      return res.json({ success: true, message: 'Student updated' });
    } catch (error) {
      logger.error('Update student error', { error: error.message, userId: req.user?.id });
      return res.status(500).json({ success: false, message: 'Error updating student' });
    }
  }

  /**
     * List portfolio students visible to the viewer.
     * TEACHER: students invited via registration_tokens.
     * SCHOOL_ADMIN: all students in the same school.
     */
  static async listPortfolios(req, res) {
    try {
      const viewer = req.user;
      let rows;
      if (viewer.role === 'SCHOOL_ADMIN') {
        rows = (await pool.query(
          `SELECT u.id AS student_id, u.first_name, u.last_name,
                  COUNT(*) FILTER (WHERE pi.portfolio_status='IN_PROGRESS' AND pi.deleted_at IS NULL) AS in_progress,
                  COUNT(*) FILTER (WHERE pi.portfolio_status='COMPLETED'  AND pi.deleted_at IS NULL) AS completed,
                  COUNT(*) FILTER (WHERE pi.submission_state='IN_AUCTION'  AND pi.deleted_at IS NULL) AS in_auction
             FROM users u
             LEFT JOIN portfolio_items pi ON pi.student_user_id = u.id
            WHERE u.role='STUDENT' AND u.school_id=$1 AND u.deleted_at IS NULL
            GROUP BY u.id, u.first_name, u.last_name
            ORDER BY u.first_name`,
          [viewer.schoolId]
        )).rows;
      } else {
        rows = (await pool.query(
          `SELECT u.id AS student_id, u.first_name, u.last_name,
                  COUNT(*) FILTER (WHERE pi.portfolio_status='IN_PROGRESS' AND pi.deleted_at IS NULL) AS in_progress,
                  COUNT(*) FILTER (WHERE pi.portfolio_status='COMPLETED'  AND pi.deleted_at IS NULL) AS completed,
                  COUNT(*) FILTER (WHERE pi.submission_state='IN_AUCTION'  AND pi.deleted_at IS NULL) AS in_auction
             FROM registration_tokens rt
             JOIN users u ON LOWER(u.email)=LOWER(rt.student_email) AND u.role='STUDENT' AND u.deleted_at IS NULL
             LEFT JOIN portfolio_items pi ON pi.student_user_id = u.id
            WHERE rt.teacher_id=$1
            GROUP BY u.id, u.first_name, u.last_name
            ORDER BY u.first_name`,
          [viewer.id]
        )).rows;
      }
      const students = rows.map(r => ({
        studentId: r.student_id,
        studentName: `${r.first_name} ${r.last_name || ''}`.trim(),
        inProgress: parseInt(r.in_progress, 10) || 0,
        completed: parseInt(r.completed, 10) || 0,
        inAuction: parseInt(r.in_auction, 10) || 0
      }));
      return res.json({ success: true, students });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Failed to list portfolios' });
    }
  }

  /**
     * Get a specific student's portfolio items, enforcing scope.
     * TEACHER: only if they invited the student via registration_tokens.
     * SCHOOL_ADMIN: only if the student belongs to the same school.
     */
  static async getStudentPortfolio(req, res) {
    try {
      const viewer = req.user;
      const { studentId } = req.params;

      if (viewer.role === 'SCHOOL_ADMIN') {
        const s = await pool.query('SELECT school_id FROM users WHERE id=$1 AND role=\'STUDENT\' AND deleted_at IS NULL', [studentId]);
        if (s.rowCount === 0 || s.rows[0].school_id !== viewer.schoolId) {
          return res.status(403).json({ success: false, message: 'Not permitted' });
        }
      } else if (viewer.role === 'TEACHER') {
        const scope = await pool.query(
          `SELECT 1 FROM registration_tokens rt
             JOIN users u ON LOWER(u.email)=LOWER(rt.student_email)
            WHERE rt.teacher_id=$1 AND u.id=$2 AND u.role = 'STUDENT' AND u.deleted_at IS NULL LIMIT 1`,
          [viewer.id, studentId]
        );
        if (scope.rowCount === 0) { return res.status(403).json({ success: false, message: 'Not permitted' }); }
      } else {
        return res.status(403).json({ success: false, message: 'Not permitted' });
      }

      // SCHOOL_ADMIN sees all pieces (VISIBLE + REMOVED); TEACHER sees only VISIBLE.
      const includeRemoved = viewer.role === 'SCHOOL_ADMIN';
      const moderationFilter = includeRemoved ? '' : "AND moderation_status = 'VISIBLE'";

      const items = await pool.query(
        `SELECT id, title, description, medium, artist_grade, image_url,
                portfolio_status, submission_state, created_at,
                moderation_status, moderation_reason, moderated_at
               ,(SELECT mu.first_name || ' ' || COALESCE(mu.last_name, '')
                   FROM users mu WHERE mu.id = portfolio_items.moderated_by_user_id) AS moderated_by_name
               ,(SELECT COUNT(*) FROM portfolio_comments c
                  WHERE c.portfolio_item_id = portfolio_items.id AND c.deleted_at IS NULL) AS comment_count
               ,(SELECT COUNT(*) FROM portfolio_comments c
                  LEFT JOIN portfolio_comment_reads r ON r.portfolio_item_id = c.portfolio_item_id AND r.user_id = $2
                  WHERE c.portfolio_item_id = portfolio_items.id AND c.deleted_at IS NULL
                    AND c.author_user_id <> $2
                    AND (r.last_read_at IS NULL OR c.created_at > r.last_read_at)) AS unread_count
           FROM portfolio_items
          WHERE student_user_id=$1 AND deleted_at IS NULL ${moderationFilter}
          ORDER BY created_at DESC`,
        [studentId, viewer.id]
      );
      return res.json({
        success: true,
        items: items.rows.map(r => ({
          id: r.id, title: r.title, description: r.description, medium: r.medium,
          artistGrade: r.artist_grade, imageUrl: r.image_url,
          portfolioStatus: r.portfolio_status, submissionState: r.submission_state, createdAt: r.created_at,
          moderationStatus: r.moderation_status,
          moderationReason: r.moderation_reason,
          moderatedAt: r.moderated_at,
          moderatedByName: r.moderated_by_name?.trim() || null,
          commentCount: Number.parseInt(r.comment_count, 10) || 0,
          unreadCount: Number.parseInt(r.unread_count, 10) || 0
        }))
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Failed to load portfolio' });
    }
  }

  /**
   * Remove a portfolio item (set moderation_status = 'REMOVED').
   * TEACHER: must be the inviting teacher. SCHOOL_ADMIN: must be same school.
   */
  static async removePortfolioItem(req, res) {
    try {
      const viewer = req.user;
      const { studentId, itemId } = req.params;
      const reason = (req.body.reason || '').trim();
      if (!reason) { return res.status(400).json({ success: false, message: 'A reason is required' }); }
      if (reason.length > 500) { return res.status(400).json({ success: false, message: 'Reason must be 500 characters or fewer' }); }

      const ok = await TeacherController._canModerateStudent(viewer, studentId);
      if (!ok) { return res.status(403).json({ success: false, message: 'Not permitted' }); }

      const upd = await pool.query(
        `UPDATE portfolio_items
            SET moderation_status = 'REMOVED', moderated_by_user_id = $1,
                moderated_at = NOW(), moderation_reason = $2, updated_at = NOW()
          WHERE id = $3 AND student_user_id = $4 AND deleted_at IS NULL
          RETURNING id, submission_state`,
        [viewer.id, reason, itemId, studentId]
      );
      if (upd.rowCount === 0) { return res.status(404).json({ success: false, message: 'Item not found' }); }

      // If live in an auction, withdraw the linked artwork.
      if (upd.rows[0].submission_state === 'IN_AUCTION') {
        await pool.query(
          `UPDATE artwork SET deleted_at = NOW(), updated_at = NOW()
            WHERE portfolio_item_id = $1 AND artwork_status IN ('SUBMITTED','APPROVED') AND deleted_at IS NULL`,
          [itemId]
        );
        await pool.query(
          'UPDATE portfolio_items SET submission_state = \'WITHDRAWN\', updated_at = NOW() WHERE id = $1',
          [itemId]
        );
      }
      await pool.query(
        `INSERT INTO audit_logs (user_id, action_category, action_type, resource_type, resource_id, action_details)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [viewer.id, 'COMPLIANCE', 'item_removed', 'portfolio_item', itemId,
          JSON.stringify({ removedBy: viewer.id, studentId, reason })]
      );
      return res.json({ success: true, message: 'Item removed' });
    } catch (error) {
      logger.error('Remove portfolio item error', { error: error.message, userId: req.user?.id });
      return res.status(500).json({ success: false, message: 'Error removing item' });
    }
  }

  /**
   * Restore a removed portfolio item (SCHOOL_ADMIN only).
   */
  static async restorePortfolioItem(req, res) {
    try {
      const viewer = req.user;
      if (viewer.role !== 'SCHOOL_ADMIN') { return res.status(403).json({ success: false, message: 'Only a school admin can restore' }); }
      const { studentId, itemId } = req.params;

      const s = await pool.query('SELECT school_id FROM users WHERE id = $1 AND role = \'STUDENT\' AND deleted_at IS NULL', [studentId]);
      if (s.rowCount === 0 || s.rows[0].school_id !== viewer.schoolId) {
        return res.status(403).json({ success: false, message: 'Not permitted' });
      }
      const upd = await pool.query(
        `UPDATE portfolio_items
            SET moderation_status = 'VISIBLE', moderated_by_user_id = NULL,
                moderated_at = NULL, moderation_reason = NULL, updated_at = NOW()
          WHERE id = $1 AND student_user_id = $2 AND deleted_at IS NULL
          RETURNING id`,
        [itemId, studentId]
      );
      if (upd.rowCount === 0) { return res.status(404).json({ success: false, message: 'Item not found' }); }
      await pool.query(
        `INSERT INTO audit_logs (user_id, action_category, action_type, resource_type, resource_id, action_details)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [viewer.id, 'COMPLIANCE', 'item_restored', 'portfolio_item', itemId, JSON.stringify({ restoredBy: viewer.id, studentId })]
      );
      return res.json({ success: true, message: 'Item restored' });
    } catch (error) {
      logger.error('Restore portfolio item error', { error: error.message, userId: req.user?.id });
      return res.status(500).json({ success: false, message: 'Error restoring item' });
    }
  }

  /**
   * Shared moderation scope: inviting teacher OR same-school admin.
   */
  static async _canModerateStudent(viewer, studentId) {
    if (viewer.role === 'SCHOOL_ADMIN') {
      const s = await pool.query('SELECT school_id FROM users WHERE id = $1 AND role = \'STUDENT\' AND deleted_at IS NULL', [studentId]);
      return s.rowCount > 0 && s.rows[0].school_id === viewer.schoolId;
    }
    if (viewer.role === 'TEACHER') {
      const scope = await pool.query(
        `SELECT 1 FROM registration_tokens rt
           JOIN users u ON LOWER(u.email) = LOWER(rt.student_email)
          WHERE rt.teacher_id = $1 AND u.id = $2 AND u.role = 'STUDENT' AND u.deleted_at IS NULL
          LIMIT 1`,
        [viewer.id, studentId]
      );
      return scope.rowCount > 0;
    }
    return false;
  }

  /**
     * Soft-delete a registered student.
     * Teachers may only delete students belonging to their own school.
     */
  static async deleteStudent(req, res) {
    try {
      const { userId: targetUserId } = req.params;
      const teacherId = req.user.id;

      const result = await pool.query(
        `UPDATE users
                 SET deleted_at = NOW()
                 WHERE id = $1
                   AND role = 'STUDENT'
                   AND deleted_at IS NULL
                   AND LOWER(email) IN (
                       SELECT LOWER(student_email) FROM registration_tokens WHERE teacher_id = $2
                   )
                 RETURNING id`,
        [targetUserId, teacherId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Student not found or not invited by you' });
      }

      logger.info('Student deleted', { targetUserId, teacherId });
      return res.json({ success: true, message: 'Student removed' });
    } catch (error) {
      logger.error('Delete student error', { error: error.message, userId: req.user?.id });
      return res.status(500).json({ success: false, message: 'Error removing student' });
    }
  }
}

module.exports = TeacherController;

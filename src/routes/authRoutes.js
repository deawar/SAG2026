/**
 * ============================================================================
 * Authentication Routes
 * Silent Auction Gallery - User Authentication Endpoints
 * ============================================================================
 */

const crypto = require('crypto');
const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const UserController = require('../controllers/userController');
const ValidationUtils = require('../utils/validationUtils');

// Import services and models
const { JWTService, TwoFactorService, RBACService, SessionService, AuthenticationService } = require('../services/authenticationService');
const { UserModel } = require('../models');

/**
 * Factory function to create auth routes with injected database
 * @param {Database} db - Initialized database connection
 * @returns {Router} Express router with auth routes
 */
module.exports = (db) => {
  const router = express.Router();

  // Initialize services with real database
  const userModel = new UserModel(db);

  // Create service instances
  const jwtService = new JWTService({
    accessTokenSecret: process.env.JWT_ACCESS_SECRET || 'dev-secret',
    refreshTokenSecret: process.env.JWT_REFRESH_SECRET || 'dev-secret',
    accessTokenExpiry: '15m',
    refreshTokenExpiry: '7d'
  });

  const twoFactorService = new TwoFactorService({
    db,
    jwtService
  });
  const rbacService = new RBACService();
  const sessionService = new SessionService({ db });

  // Create auth service object to pass to controller
  const authService = {
    jwtService,
    twoFactorService,
    rbacService,
    sessionService
  };

  const userController = new UserController(userModel, authService);

  const authenticationService = new AuthenticationService({
    db,
    userModel,
    jwtService,
    twoFactorService,
    rbacService,
    sessionService
  });

  /**
 * POST /api/auth/register
 * Register a new user
 * Auth: Not required
 *
 * Body:
 * {
 *   "email": "user@example.com",
 *   "password": "SecurePassword123!",
 *   "firstName": "John",
 *   "lastName": "Doe",
 *   "dateOfBirth": "2010-01-15",
 *   "schoolId": "uuid",
 *   "role": "STUDENT"
 * }
 *
 * Response: 201
 * {
 *   "success": true,
 *   "message": "User registered successfully",
 *   "data": {
 *     "userId": "uuid",
 *     "email": "user@example.com",
 *     "accessToken": "jwt",
 *     "refreshToken": "jwt"
 *   }
 * }
 */
  router.post('/register', (req, res, next) => {
    return userController.register(req, res, next);
  });

  /**
 * POST /api/auth/login
 * Authenticate user and return access token
 * Auth: Not required
 *
 * Body:
 * {
 *   "email": "user@example.com",
 *   "password": "SecurePassword123!"
 * }
 *
 * Response: 200
 * {
 *   "success": true,
 *   "message": "Login successful",
 *   "data": {
 *     "userId": "uuid",
 *     "email": "user@example.com",
 *     "role": "STUDENT",
 *     "accessToken": "jwt",
 *     "refreshToken": "jwt",
 *     "expiresIn": "15m"
 *   }
 * }
 *
 * If 2FA enabled:
 * Response: 200
 * {
 *   "success": true,
 *   "message": "2FA verification required",
 *   "data": {
 *     "requiresMfa": true,
 *     "tempToken": "jwt",
 *     "userId": "uuid"
 *   }
 * }
 */
  router.post('/login', (req, res, next) => userController.login(req, res, next));

  /**
 * POST /api/auth/logout
 * Logout user and invalidate tokens
 * Auth: Required
 *
 * Headers:
 * - Authorization: Bearer <accessToken>
 *
 * Response: 200
 * {
 *   "success": true,
 *   "message": "Logged out successfully"
 * }
 */
  router.post('/logout',
    authMiddleware.verifyToken,
    (req, res, next) => userController.logout(req, res, next)
  );

  /**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 * Auth: Not required
 *
 * Body:
 * {
 *   "refreshToken": "jwt"
 * }
 *
 * Response: 200
 * {
 *   "success": true,
 *   "message": "Token refreshed successfully",
 *   "data": {
 *     "accessToken": "jwt",
 *     "expiresIn": "15m"
 *   }
 * }
 */
  router.post('/refresh', (req, res, next) => userController.refreshToken(req, res, next));

  /**
 * POST /api/auth/verify-2fa
 * Verify 2FA code and complete login
 * Auth: Not required (uses temp token)
 *
 * Body:
 * {
 *   "userId": "uuid",
 *   "tempToken": "jwt",
 *   "code": "123456"
 * }
 *
 * Response: 200
 * {
 *   "success": true,
 *   "message": "2FA verification successful",
 *   "data": {
 *     "accessToken": "jwt",
 *     "refreshToken": "jwt",
 *     "expiresIn": "15m"
 *   }
 * }
 */
  router.post('/verify-2fa', (req, res, next) => userController.verify2FA(req, res, next));

  /**
 * POST /api/auth/2fa/setup
 * Setup 2FA for authenticated user
 * Auth: Required
 *
 * Headers:
 * - Authorization: Bearer <accessToken>
 *
 * Response: 200
 * {
 *   "success": true,
 *   "data": {
 *     "secret": "base32-encoded-secret",
 *     "qrCode": "otpauth://url",
 *     "backupCodes": ["code1", "code2", ...]
 *   }
 * }
 */
  router.post('/2fa/setup', authMiddleware.verifyToken, async (req, res, next) => {
    try {
      const QRCode = require('qrcode');
      const userId = req.user.id;
      const secretData = await authenticationService.twoFactorService.generateSecret(userId, req.user.email);

      // Convert otpauth:// URI to a scannable PNG data URL
      const qrCodeDataUrl = await QRCode.toDataURL(secretData.qrCode);

      return res.json({
        success: true,
        data: {
          ...secretData,
          qrCode: qrCodeDataUrl
        }
      });
    } catch (error) {
      next(error);
    }
  });

  /**
 * GET /api/auth
 * Info endpoint - returns available auth endpoints
 * Auth: Not required
 *
 * Response: 200
 * {
 *   "success": true,
 *   "data": {
 *     "endpoints": [...],
 *     "status": "ok"
 *   }
 * }
 */
  router.get('/', (req, res) => {
    res.json({
      success: true,
      message: 'Authentication API - Available endpoints',
      data: {
        status: 'operational',
        endpoints: [
          { method: 'POST', path: '/api/auth/register', description: 'Register new user' },
          { method: 'POST', path: '/api/auth/login', description: 'User login' },
          { method: 'POST', path: '/api/auth/logout', description: 'User logout' },
          { method: 'POST', path: '/api/auth/refresh', description: 'Refresh access token' },
          { method: 'POST', path: '/api/auth/verify-2fa', description: 'Verify 2FA code' },
          { method: 'POST', path: '/api/auth/2fa/setup', description: 'Setup 2FA' },
          { method: 'POST', path: '/api/auth/2fa/verify', description: 'Verify and enable 2FA' }
        ]
      },
      timestamp: new Date().toISOString()
    });
  });

  /**
 * POST /api/auth/2fa/verify
 * Verify and enable 2FA
 * Auth: Required
 *
 * Headers:
 * - Authorization: Bearer <accessToken>
 *
 * Body:
 * {
 *   "secret": "base32-encoded-secret",
 *   "code": "123456"
 * }
 *
 * Response: 200
 * {
 *   "success": true,
 *   "message": "2FA enabled successfully"
 * }
 */
  router.post('/2fa/verify', authMiddleware.verifyToken, async (req, res, next) => {
    try {
      const { secret, code, backupCodes: clientBackupCodes } = req.body;
      const userId = req.user.id;

      if (!secret || !code) {
        return res.status(400).json({
          success: false,
          message: 'Secret and code required'
        });
      }

      // Use backup codes sent from setup step; fall back to generating new ones
      const backupCodes = Array.isArray(clientBackupCodes) && clientBackupCodes.length > 0
        ? clientBackupCodes
        : twoFactorService._generateBackupCodes(8);

      // confirmSetup verifies the TOTP code and persists 2FA (secret + backup codes) to DB
      await twoFactorService.confirmSetup(userId, secret, code, backupCodes);

      return res.json({
        success: true,
        message: '2FA enabled successfully'
      });
    } catch (error) {
      if (error.message === 'INVALID_2FA_TOKEN') {
        return res.status(400).json({ success: false, message: 'Invalid 2FA code' });
      }
      next(error);
    }
  });

  /**
 * POST /api/auth/2fa/disable
 * Disable 2FA for the authenticated user
 * Auth: Required
 *
 * Body: none (auth token is sufficient proof of account control)
 * Response: 200 { ok: true }
 */
  router.post('/2fa/disable', authMiddleware.verifyToken, async (req, res, next) => {
    try {
      const userId = req.user.id;

      await db.query(
        `UPDATE users
         SET two_fa_enabled = FALSE, two_fa_secret = NULL, backup_codes = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [userId]
      );

      await authenticationService._recordAuditLog(userId, 'SECURITY', '2FA_DISABLED', {});

      return res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  /**
 * POST /api/auth/password-reset
 * Verify 6-digit reset code and set a new password (step 2 of code-based reset)
 * Auth: Not required | Rate-limited by authLimiter (applied at app level)
 *
 * Body: { email, code, newPassword }
 * Response: 200 { ok: true }
 *           400 { error: 'invalid_or_expired_code' } on bad/expired code
 *           400 { success: false, message: string } on validation failure
 */
  router.post('/password-reset', async (req, res, next) => {
    try {
      const { email, code, newPassword } = req.body;

      if (!email || !code || !newPassword) {
        return res.status(400).json({ success: false, message: 'Email, code, and new password required' });
      }

      if (!ValidationUtils.validateEmail(email)) {
        return res.status(400).json({ success: false, message: 'Valid email required' });
      }

      if (!ValidationUtils.validatePassword(newPassword)) {
        return res.status(400).json({
          success: false,
          message: 'Password does not meet requirements: 12+ chars, uppercase, lowercase, number, special character'
        });
      }

      const sanitizedEmail = ValidationUtils.sanitizeString(email, 254).toLowerCase();
      await authenticationService.verifyPasswordResetCode(sanitizedEmail, String(code), newPassword);

      return res.json({ ok: true });
    } catch (error) {
      if (error.message === 'INVALID_OR_EXPIRED_CODE') {
        return res.status(400).json({ success: false, error: 'invalid_or_expired_code', message: 'The code is invalid or has expired' });
      }
      next(error);
    }
  });

  /**
 * POST /api/auth/password-reset/send-code
 * Request a 6-digit password reset code sent to the user's email
 * Auth: Not required | Rate-limited by authLimiter (applied at app level)
 * Always returns 200 to prevent email enumeration
 *
 * Body: { email: string }
 * Response: 200 { ok: true }
 */
  router.post('/password-reset/send-code', async (req, res, next) => {
    try {
      const { email } = req.body;

      if (!email || !ValidationUtils.validateEmail(email)) {
        return res.status(400).json({ success: false, message: 'Valid email required' });
      }

      const sanitizedEmail = ValidationUtils.sanitizeString(email, 254).toLowerCase();
      await authenticationService.sendPasswordResetCode(sanitizedEmail);

      return res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  /**
 * POST /api/auth/reset-password
 * Complete admin-initiated token-based password reset
 * Auth: Not required (token serves as credential)
 *
 * Body: { token: string, newPassword: string }
 * Response: 200 { success: true, message: string }
 */
  router.post('/reset-password', async (req, res, next) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({ success: false, message: 'Token and new password are required' });
      }

      await authenticationService.completePasswordReset(token, newPassword);

      return res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
    } catch (error) {
      if (error.message === 'INVALID_OR_EXPIRED_RESET_TOKEN') {
        return res.status(400).json({ success: false, message: 'This reset link is invalid or has already been used.' });
      }
      next(error);
    }
  });

  /**
   * GET /api/auth/verify-email?uid=<id>&token=<raw>
   * Verify email address from registration link.
   * Auth: Not required | Rate-limited by authLimiter (applied at app level)
   */
  router.get('/verify-email', async (req, res, next) => {
    try {
      const { uid, token } = req.query;
      if (!uid || !token) {
        return res.status(400).json({ success: false, message: 'Missing uid or token' });
      }
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const verified = await userModel.verifyEmailToken(uid, tokenHash);
      if (!verified) {
        return res.status(400).json({ success: false, message: 'Invalid or expired verification link.' });
      }
      return res.json({ ok: true, message: 'Email verified. You can now log in.' });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/auth/resend-verification
   * Re-send the email verification link.
   * Auth: Not required | Rate-limited by authLimiter (applied at app level)
   * Always returns 200 to prevent email enumeration.
   *
   * Body: { email: string }
   */
  router.post('/resend-verification', async (req, res, next) => {
    try {
      const { email } = req.body;
      if (email && ValidationUtils.validateEmail(email)) {
        const sanitizedEmail = ValidationUtils.sanitizeString(email, 254).toLowerCase();
        const user = await userModel.getByEmail(sanitizedEmail);
        if (user && !user.email_verified_at && user.account_status === 'PENDING') {
          const rawToken = crypto.randomBytes(32).toString('hex');
          const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
          await userModel.setVerificationToken(user.id, tokenHash, expiresAt);
          // Use userController's private send helper via a temporary controller instance
          const uc = new UserController(userModel, authService);
          await uc._sendVerificationEmail(user.email, user.first_name || 'User', user.id, rawToken);
        }
      }
      return res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  /**
 * ============================================================================
 * EXPORT ROUTES
 * ============================================================================
 */

  return router;
};

/**
 * ============================================================================
 * Authentication Routes
 * Silent Auction Gallery - User Authentication Endpoints
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const UserController = require('../controllers/userController');

// Import services and models
const authenticationService = require('../services/authenticationService');
const { UserModel } = require('../models');

// Placeholder for database connection (will be properly injected in index.js)
const db = { query: async () => ({ rows: [] }) };

// Initialize services
const userModel = new UserModel(db);
const userController = new UserController(userModel, authenticationService);

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
router.post('/register', (req, res, next) => userController.register(req, res, next));

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
router.post('/2fa/setup', authMiddleware.verifyToken, (req, res, next) => {
  try {
    const userId = req.user.id;
    const secret = authenticationService.twoFactorService.generateSecret(userId, req.user.email);
    
    return res.json({
      success: true,
      data: secret
    });
  } catch (error) {
    next(error);
  }
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
    const { secret, code } = req.body;
    const userId = req.user.id;

    if (!secret || !code) {
      return res.status(400).json({
        success: false,
        message: 'Secret and code required'
      });
    }

    // Verify code
    const isValid = authenticationService.twoFactorService.verifyToken(secret, code);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid 2FA code'
      });
    }

    // Enable 2FA for user
    const backupCodes = ['BACKUP01', 'BACKUP02', 'BACKUP03', 'BACKUP04', 'BACKUP05', 'BACKUP06', 'BACKUP07', 'BACKUP08'];
    // TODO: Implement database update to enable 2FA

    return res.json({
      success: true,
      message: '2FA enabled successfully',
      data: {
        backupCodes
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ============================================================================
 * EXPORT ROUTES
 * ============================================================================
 */

module.exports = router;

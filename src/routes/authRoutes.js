/**
 * ============================================================================
 * Authentication Routes
 * Silent Auction Gallery - User Authentication Endpoints
 * ============================================================================
 */

const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const UserController = require('../controllers/userController');

// Import services and models
const { JWTService, TwoFactorService, RBACService, SessionService } = require('../services/authenticationService');
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
  const sessionService = new SessionService(db);
  
  // Create auth service object to pass to controller
  const authService = {
    jwtService,
    twoFactorService,
    rbacService,
    sessionService
  };
  
  const userController = new UserController(userModel, authService);

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
    const { secret, code } = req.body;
    const userId = req.user.id;

    if (!secret || !code) {
      return res.status(400).json({
        success: false,
        message: 'Secret and code required'
      });
    }

    // Verify code against the secret
    const isValid = twoFactorService.verifyToken(secret, code);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid 2FA code'
      });
    }

    // Generate backup codes using the service
    const backupCodes = twoFactorService.generateBackupCodes();

    // Update user in database to enable 2FA
    // Store: secret (encrypted), backup codes (encrypted), and enabled flag
    await userModel.update(userId, {
      two_fa_enabled: true,
      two_fa_secret: secret,
      two_fa_backup_codes: JSON.stringify(backupCodes),
      two_fa_backup_codes_used: JSON.stringify([])
    });

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

  return router;
};

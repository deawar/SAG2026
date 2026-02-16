/**
 * ============================================================================
 * User Controller
 * Handles authentication endpoints: login, register, logout, password reset
 * ============================================================================
 */

const ValidationUtils = require('../utils/validationUtils');

class UserController {
  constructor(userModel, authenticationService) {
    this.userModel = userModel;
    this.authService = authenticationService;
  }

  /**
   * Register a new user
   * POST /api/auth/register
   * 
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next middleware
   */
  async register(req, res, next) {
    try {
      const { email, password, firstName, lastName, dateOfBirth, schoolId, phone, accountType } = req.body;

      // 1. Validate required fields
      if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields',
          errors: ['email', 'password', 'firstName', 'lastName']
        });
      }

      // 2. Validate email format
      if (!ValidationUtils.validateEmail(email)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format',
          errors: ['email']
        });
      }

      // 3. Validate password strength
      if (!ValidationUtils.validatePassword(password)) {
        return res.status(400).json({
          success: false,
          message: 'Password does not meet requirements: 12+ chars, uppercase, lowercase, number, special character',
          errors: ['password']
        });
      }

      // 4. Sanitize inputs
      const sanitizedEmail = ValidationUtils.sanitizeString(email, 254).toLowerCase();
      const sanitizedFirstName = ValidationUtils.sanitizeString(firstName, 100);
      const sanitizedLastName = ValidationUtils.sanitizeString(lastName, 100);
      const sanitizedPhone = phone ? ValidationUtils.sanitizeString(phone, 20) : null;

      // 5. Determine role based on account type
      let finalRole = 'STUDENT'; // Default to student
      if (accountType === 'teacher') {
        finalRole = 'TEACHER';
      }

      // 6. Create user in database
      const user = await this.userModel.create({
        email: sanitizedEmail,
        password,
        firstName: sanitizedFirstName,
        lastName: sanitizedLastName,
        phoneNumber: sanitizedPhone,
        dateOfBirth,
        schoolId,
        role: finalRole
      });

      // 7. Generate tokens
      const accessTokenResult = this.authService.jwtService.generateAccessToken(user.id, {
        email: user.email,
        role: user.role,
        schoolId: user.school_id
      });

      const refreshTokenResult = this.authService.jwtService.generateRefreshToken(user.id);

      // 8. Return success response (NO password data)
      return res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          userId: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          accessToken: accessTokenResult.token,
          refreshToken: refreshTokenResult.token
        }
      });
    } catch (error) {
      // Check for specific error types
      if (error.message === 'EMAIL_ALREADY_EXISTS') {
        return res.status(409).json({
          success: false,
          message: 'Email already registered'
        });
      }
      next(error);
    }
  }

  /**
   * Login user
   * POST /api/auth/login
   * 
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next middleware
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      // 1. Validate required fields
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password required',
          errors: ['email', 'password']
        });
      }

      // 2. Validate email format
      if (!ValidationUtils.validateEmail(email)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format',
          errors: ['email']
        });
      }

      // 3. Sanitize email
      const sanitizedEmail = ValidationUtils.sanitizeString(email, 254).toLowerCase();

      // 3. Retrieve user by email
      const user = await this.userModel.getByEmail(sanitizedEmail);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // 4. Check if account is active
      if (user.account_status !== 'ACTIVE') {
        return res.status(403).json({
          success: false,
          message: 'Account is inactive'
        });
      }

      // 5. Verify password
      const passwordValid = await this.userModel.checkPassword(password, user.password_hash);

      if (!passwordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // 6. Check if 2FA is enabled
      if (user.two_fa_enabled) {
        // Generate temporary 2FA token
        const tempToken = this.authService.jwtService.generateAccessToken(user.id, {
          email: user.email,
          role: user.role,
          schoolId: user.school_id,
          purpose: '2fa_challenge'
        });

        return res.status(200).json({
          success: true,
          message: '2FA verification required',
          data: {
            requiresMfa: true,
            tempToken: tempToken.token,
            userId: user.id
          }
        });
      }

      // 7. Generate access and refresh tokens
      const accessTokenResult = this.authService.jwtService.generateAccessToken(user.id, {
        email: user.email,
        role: user.role,
        schoolId: user.school_id
      });

      const refreshTokenResult = this.authService.jwtService.generateRefreshToken(user.id);

      // 8. Update last login
      await this.userModel.updateLastLogin(user.id);

      // 9. Return tokens (NO sensitive data)
      return res.json({
        success: true,
        message: 'Login successful',
        data: {
          userId: user.id,
          email: user.email,
          role: user.role,
          accessToken: accessTokenResult.token,
          refreshToken: refreshTokenResult.token,
          expiresIn: accessTokenResult.expiresIn
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Logout user
   * POST /api/auth/logout
   * Auth: Required
   * 
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next middleware
   */
  async logout(req, res, next) {
    try {
      const userId = req.user.id;
      const jti = req.user.jti; // JWT ID for token revocation

      if (!userId || !jti) {
        return res.status(400).json({
          success: false,
          message: 'Missing user or token information'
        });
      }

      // 1. Add token to blacklist (JTI-based revocation)
      // In production, this would store the JTI in Redis or database
      // For now, we'll just return success
      // TODO: Implement token blacklist/revocation

      // 2. Return success response
      return res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Refresh access token
   * POST /api/auth/refresh
   * 
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next middleware
   */
  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'Refresh token required'
        });
      }

      // 1. Verify refresh token
      let decoded;
      try {
        decoded = this.authService.jwtService.verifyRefreshToken(refreshToken);
      } catch (error) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired refresh token'
        });
      }

      // 2. Retrieve user
      const user = await this.userModel.getById(decoded.sub);

      // 3. Generate new access token
      const accessTokenResult = this.authService.jwtService.generateAccessToken(user.id, {
        email: user.email,
        role: user.role,
        schoolId: user.school_id
      });

      // 4. Return new access token
      return res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken: accessTokenResult.token,
          expiresIn: accessTokenResult.expiresIn
        }
      });
    } catch (error) {
      if (error.message === 'USER_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      next(error);
    }
  }

  /**
   * Verify 2FA code and complete login
   * POST /api/auth/verify-2fa
   * 
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next middleware
   */
  async verify2FA(req, res, next) {
    try {
      const { userId, tempToken, code } = req.body;

      if (!userId || !code) {
        return res.status(400).json({
          success: false,
          message: 'userId and 2FA code required'
        });
      }

      // 1. Retrieve user
      const user = await this.userModel.getById(userId, true);

      if (!user.two_fa_enabled || !user.two_fa_secret) {
        return res.status(400).json({
          success: false,
          message: '2FA not enabled for this user'
        });
      }

      // 2. Verify 2FA code
      const isValid = this.authService.twoFactorService.verifyToken(user.two_fa_secret, code);

      if (!isValid) {
        return res.status(400).json({
          success: false,
          message: 'Invalid 2FA code'
        });
      }

      // 3. Generate access token
      const accessTokenResult = this.authService.jwtService.generateAccessToken(user.id, {
        email: user.email,
        role: user.role,
        schoolId: user.school_id
      });

      const refreshTokenResult = this.authService.jwtService.generateRefreshToken(user.id);

      // 4. Return tokens
      return res.json({
        success: true,
        message: '2FA verification successful',
        data: {
          accessToken: accessTokenResult.token,
          refreshToken: refreshTokenResult.token,
          expiresIn: accessTokenResult.expiresIn
        }
      });
    } catch (error) {
      if (error.message === 'USER_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      next(error);
    }
  }

  /**
   * Get user profile (requires authentication)
   * GET /api/user/profile
   * 
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next middleware
   */
  async getProfile(req, res, next) {
    try {
      // User ID comes from JWT token (verified by auth middleware)
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // Retrieve user profile (exclude sensitive fields)
      const user = await this.userModel.getById(userId, false);

      return res.json({
        success: true,
        message: 'User profile retrieved successfully',
        data: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phoneNumber: user.phone_number,
          role: user.role,
          schoolId: user.school_id,
          accountStatus: user.account_status,
          lastLogin: user.last_login,
          createdAt: user.created_at
        }
      });
    } catch (error) {
      if (error.message === 'USER_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      next(error);
    }
  }
}

module.exports = UserController;

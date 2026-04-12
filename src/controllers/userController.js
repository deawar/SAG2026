/**
 * ============================================================================
 * User Controller
 * Handles authentication endpoints: login, register, logout, password reset
 * ============================================================================
 */

const crypto = require('crypto');
const ValidationUtils = require('../utils/validationUtils');
const { tokenBlacklist } = require('../services/authenticationService');

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

      // 7. Generate and store email verification token (24h expiry)
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await this.userModel.setVerificationToken(user.id, tokenHash, expiresAt);

      // 8. Send verification email (best-effort; suppressed in test mode)
      await this._sendVerificationEmail(user.email, user.first_name || 'User', user.id, rawToken);

      // 9. Return success — no JWT until email is verified
      return res.status(201).json({
        ok: true,
        requiresVerification: true,
        message: 'Registration successful. Please check your email to verify your account.'
      });
    } catch (error) {
      // Map model/validation error codes to user-facing 400/409 responses
      const validationErrors = {
        'EMAIL_ALREADY_EXISTS': { status: 409, message: 'Email already registered' },
        'INVALID_EMAIL': { status: 400, message: 'Invalid email format' },
        'PASSWORD_TOO_SHORT': { status: 400, message: 'Password must be at least 12 characters' },
        'PASSWORD_MISSING_UPPERCASE': { status: 400, message: 'Password must contain an uppercase letter' },
        'PASSWORD_MISSING_LOWERCASE': { status: 400, message: 'Password must contain a lowercase letter' },
        'PASSWORD_MISSING_NUMBER': { status: 400, message: 'Password must contain a number' },
        'PASSWORD_MISSING_SPECIAL_CHAR': { status: 400, message: 'Password must contain a special character (!@#$%^&*()_+-=etc.)' },
        'PASSWORD_TOO_COMMON': { status: 400, message: 'Password is too common, please choose a stronger one' },
        'INVALID_FIRST_NAME': { status: 400, message: 'First name must be 2–100 characters' },
        'INVALID_LAST_NAME': { status: 400, message: 'Last name must be 2–100 characters' },
        'INVALID_ROLE': { status: 400, message: 'Invalid account type' },
        'INVALID_DATE_OF_BIRTH': { status: 400, message: 'Invalid date of birth' },
        'COPPA_PARENTAL_CONSENT_REQUIRED': { status: 400, message: 'Parental consent required for users under 13' }
      };

      const mapped = validationErrors[error.message];
      if (mapped) {
        return res.status(mapped.status).json({ success: false, message: mapped.message });
      }
      // PostgreSQL unique constraint violation (e.g. email already exists at DB level)
      if (error.code === '23505') {
        return res.status(409).json({ success: false, message: 'Email already registered' });
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

      // 4. Check email verification before account status
      if (!user.email_verified_at) {
        return res.status(403).json({
          success: false,
          error: 'email_not_verified',
          message: 'Please verify your email address before logging in.'
        });
      }

      // 4b. Check if account is active
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
          firstName: user.first_name || '',
          lastName: user.last_name || '',
          role: user.role,
          schoolId: user.school_id || null,
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
      const { jti, exp } = req.user;
      const { refreshToken } = req.body;

      if (!jti) {
        return res.status(400).json({
          success: false,
          message: 'Invalid token: missing JTI'
        });
      }

      // 1. Revoke the access token — use its exp claim so the blacklist
      //    entry is automatically irrelevant once the token would have
      //    expired anyway. Fall back to 15 min from now if exp is absent.
      const accessExpiry = exp
        ? new Date(exp * 1000)
        : new Date(Date.now() + 15 * 60 * 1000);
      await tokenBlacklist.revoke(jti, accessExpiry);

      // 2. Revoke the refresh token if the client sent it.
      //    Ignore invalid/expired tokens — they are already unusable.
      if (refreshToken) {
        try {
          const decoded = this.authService.jwtService.verifyRefreshToken(refreshToken);
          if (decoded.jti && decoded.exp) {
            await tokenBlacklist.revoke(decoded.jti, new Date(decoded.exp * 1000));
          }
        } catch (_err) {
          // Refresh token already expired or invalid — nothing to revoke
        }
      }

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

      // 2. Check refresh token has not been revoked (e.g. via logout)
      if (await tokenBlacklist.isRevoked(decoded.jti)) {
        return res.status(401).json({
          success: false,
          message: 'Refresh token has been revoked'
        });
      }

      // 3. Retrieve user
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
      const { code } = req.body;

      // Extract the temp token from the Authorization header
      const authHeader = req.headers.authorization;
      const tempToken = authHeader && authHeader.split(' ')[1];

      if (!tempToken || !code) {
        return res.status(400).json({
          success: false,
          message: '2FA code and token required'
        });
      }

      // Decode the temp token to get userId (validates signature and expiry)
      let userId;
      try {
        const decoded = this.authService.jwtService.verifyAccessToken(tempToken);
        if (decoded.purpose !== '2fa_challenge') {
          return res.status(401).json({ success: false, message: 'Invalid token type' });
        }
        userId = decoded.sub;
      } catch (err) {
        return res.status(401).json({ success: false, message: 'Token invalid or expired' });
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

      // 4. Update last login
      await this.userModel.updateLastLogin(user.id);

      // 5. Return tokens with user info for the frontend
      return res.json({
        success: true,
        message: '2FA verification successful',
        data: {
          accessToken: accessTokenResult.token,
          refreshToken: refreshTokenResult.token,
          expiresIn: accessTokenResult.expiresIn,
          userId: user.id,
          email: user.email,
          firstName: user.first_name || '',
          lastName: user.last_name || '',
          role: user.role,
          schoolId: user.school_id || null
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
          twoFactorEnabled: !!user.two_fa_enabled,
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
  /**
   * Send an email verification link. Suppressed in test mode.
   * Uses the same SMTP pattern as authenticationService._sendResetCodeEmail.
   */
  async _sendVerificationEmail(email, firstName, userId, rawToken) {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const verifyUrl = `${appUrl}/verify-email.html?uid=${encodeURIComponent(userId)}&token=${encodeURIComponent(rawToken)}`;

    const smtpHost = process.env.SMTP_HOST;
    if (smtpHost) {
      try {
        const { EmailProvider } = require('../services/notificationService');
        const emailProvider = new EmailProvider({
          provider: 'smtp',
          host: smtpHost,
          port: parseInt(process.env.SMTP_PORT || '587', 10),
          secure: process.env.SMTP_SECURE === 'true',
          user: process.env.SMTP_USER,
          password: process.env.SMTP_PASSWORD,
          fromEmail: process.env.EMAIL_FROM || `noreply@${smtpHost}`
        });
        const subject = 'Verify your Silent Auction Gallery account';
        const text = `Hi ${firstName},\n\nPlease verify your email by clicking:\n${verifyUrl}\n\nThis link expires in 24 hours.`;
        const html = `<h2>Verify Your Email</h2><p>Hi ${firstName},</p><p>Click below to activate your account:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 24 hours.</p>`;
        await emailProvider.send(email, subject, html, text);
        return;
      } catch (err) {
        console.error('Verification email send failed:', err.message);
      }
    }

    if (process.env.NODE_ENV !== 'test') {
      console.log(`[DEV] Email verification link for ${email}: ${verifyUrl}`);
    }
  }
}

module.exports = UserController;

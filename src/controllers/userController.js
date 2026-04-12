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
      const { email, password, firstName, lastName, dateOfBirth, parentEmail, schoolId, phone, accountType } = req.body;

      // 1. Validate required fields
      if (!email || !password || !firstName) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields',
          errors: ['email', 'password', 'firstName']
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

      // 5. Determine role based on account type
      let finalRole = 'STUDENT'; // Default to student
      if (accountType === 'teacher') {
        finalRole = 'TEACHER';
      }

      // 6. COPPA age check for STUDENT / BIDDER paths
      const isMinorPath = (finalRole === 'STUDENT' || finalRole === 'BIDDER');
      if (isMinorPath && !dateOfBirth) {
        return res.status(400).json({ success: false, message: 'dateOfBirth is required', errors: ['dateOfBirth'] });
      }

      let isUnder13 = false;
      if (dateOfBirth) {
        const dob = new Date(dateOfBirth);
        if (isNaN(dob.getTime())) {
          return res.status(400).json({ success: false, message: 'Invalid date of birth', errors: ['dateOfBirth'] });
        }
        // Compute age
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
        isUnder13 = age < 13;
      }

      if (isUnder13) {
        // --- Under-13 path: require parentEmail, data minimization, consent flow ---
        if (!parentEmail || !ValidationUtils.validateEmail(parentEmail)) {
          return res.status(400).json({
            success: false,
            message: 'parentEmail is required and must be valid for users under 13',
            errors: ['parentEmail']
          });
        }
        const sanitizedParentEmail = ValidationUtils.sanitizeString(parentEmail, 254).toLowerCase();

        // Data minimization: do not store last name or phone
        const rawConsentToken = crypto.randomBytes(32).toString('hex');
        const consentTokenHash = crypto.createHash('sha256').update(rawConsentToken).digest('hex');
        const consentExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        const user = await this.userModel.create({
          email: sanitizedEmail,
          password,
          firstName: sanitizedFirstName,
          lastName: null,       // data minimization
          phoneNumber: null,    // data minimization
          dateOfBirth,
          schoolId,
          role: finalRole,
          requiresParentalConsent: true,
          parentalConsentStatus: 'pending',
          parentEmail: sanitizedParentEmail,
          parentConsentToken: consentTokenHash,
          parentConsentExpiresAt: consentExpiresAt
        });

        // Send consent email to parent (best-effort)
        await this._sendParentConsentEmail(sanitizedParentEmail, sanitizedFirstName, user.id, rawConsentToken);

        return res.status(201).json({
          ok: true,
          requiresParentalConsent: true,
          message: 'Registration received. A parental consent email has been sent to the provided address.'
        });
      }

      // --- Adult path ---
      if (!lastName) {
        return res.status(400).json({ success: false, message: 'Missing required fields', errors: ['lastName'] });
      }
      const sanitizedLastName = ValidationUtils.sanitizeString(lastName, 100);
      const sanitizedPhone = phone ? ValidationUtils.sanitizeString(phone, 20) : null;

      // 7. Create user in database
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

      // 8. Generate and store email verification token (24h expiry)
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await this.userModel.setVerificationToken(user.id, tokenHash, expiresAt);

      // 9. Send verification email (best-effort; suppressed in test mode)
      await this._sendVerificationEmail(user.email, user.first_name || 'User', user.id, rawToken);

      // 10. Return success — no JWT until email is verified
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

      // 4. COPPA guard: block login if parental consent is still pending or denied
      if (user.requires_parental_consent && user.parental_consent_status !== 'granted') {
        return res.status(403).json({
          success: false,
          error: 'parental_consent_required',
          message: 'This account requires parental consent before you can log in.'
        });
      }

      // 4b. Check email verification before account status
      if (!user.email_verified_at) {
        return res.status(403).json({
          success: false,
          error: 'email_not_verified',
          message: 'Please verify your email address before logging in.'
        });
      }

      // 4c. Check if account is active
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

      // 6a. Admin 2FA enforcement: admins without 2FA must set it up before accessing the app
      const adminRoles = ['SITE_ADMIN', 'SCHOOL_ADMIN'];
      if (adminRoles.includes(user.role) && !user.two_fa_enabled) {
        const setupToken = this.authService.jwtService.generateAccessToken(user.id, {
          email: user.email,
          role: user.role,
          schoolId: user.school_id,
          purpose: '2fa_force_setup',
          twoFaEnabled: false
        });

        return res.status(200).json({
          success: true,
          message: '2FA setup required for admin accounts',
          data: {
            requiresTwoFactorSetup: true,
            setupToken: setupToken.token,
            userId: user.id
          }
        });
      }

      // 6b. Check if 2FA is enabled (voluntary — non-admin users who opted in)
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
        schoolId: user.school_id,
        twoFaEnabled: false
      });

      const refreshTokenResult = this.authService.jwtService.generateRefreshToken(user.id);

      // 8. Update last login
      await this.userModel.updateLastLogin(user.id);

      // 8b. Session tracking (non-fatal: failure does not block login)
      await this._createSessionRecord(user.id, refreshTokenResult.jti, req);

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
      //    Also marks the user_sessions row as revoked.
      //    Ignore invalid/expired tokens — they are already unusable.
      if (refreshToken) {
        try {
          const decoded = this.authService.jwtService.verifyRefreshToken(refreshToken);
          if (decoded.jti && decoded.exp) {
            await tokenBlacklist.revoke(decoded.jti, new Date(decoded.exp * 1000));
            // Revoke session row in DB (non-fatal)
            if (this.authService?.sessionService) {
              this.authService.sessionService.revokeSession(req.user.id, decoded.jti).catch(() => {});
            }
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

      // 2b. Check session record in DB — reject if explicitly revoked (session-limiting)
      if (this.authService?.sessionService) {
        try {
          const session = await this.authService.sessionService.checkSession(decoded.jti);
          if (session?.revoked) {
            return res.status(401).json({
              success: false,
              message: 'Session has been revoked'
            });
          }
          // Update last_used_at (non-blocking)
          if (session !== null) {
            this.authService.sessionService.updateLastUsed(decoded.jti).catch(() => {});
          }
        } catch (_err) {
          // DB error checking session — fail open to avoid locking users out
        }
      }

      // 3. Retrieve user
      const user = await this.userModel.getById(decoded.sub);

      // 3. Generate new access token
      const accessTokenResult = this.authService.jwtService.generateAccessToken(user.id, {
        email: user.email,
        role: user.role,
        schoolId: user.school_id,
        twoFaEnabled: !!user.two_fa_enabled
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
        schoolId: user.school_id,
        twoFaEnabled: true
      });

      const refreshTokenResult = this.authService.jwtService.generateRefreshToken(user.id);

      // 4. Update last login
      await this.userModel.updateLastLogin(user.id);

      // 4b. Session tracking
      await this._createSessionRecord(user.id, refreshTokenResult.jti, req);

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

  /**
   * Send parental consent request email. Suppressed in test mode.
   */
  async _sendParentConsentEmail(parentEmail, childFirstName, userId, rawToken) {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const consentUrl = `${appUrl}/parental-consent.html?token=${encodeURIComponent(rawToken)}&uid=${encodeURIComponent(userId)}`;

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
        const subject = 'Parental Consent Required — Silent Auction Gallery';
        const text = [
          `Your child ${childFirstName} has registered on Silent Auction Gallery, a school art fundraising platform.`,
          '',
          'What data we collect: first name, email address, date of birth, and school affiliation.',
          'How it is used: to allow your child to view and bid on student artwork at school auctions.',
          'We do not sell or share this data with third parties.',
          '',
          `To grant consent, visit: ${consentUrl}`,
          '',
          'If you did not expect this email or wish to deny consent, use the same link and choose "Deny".',
          'This link expires in 7 days.'
        ].join('\n');
        const html = `
          <h2>Parental Consent Required</h2>
          <p>Your child <strong>${childFirstName}</strong> has registered on <strong>Silent Auction Gallery</strong>,
          a school art fundraising platform.</p>
          <h3>Data we collect</h3>
          <ul>
            <li>First name</li>
            <li>Email address</li>
            <li>Date of birth</li>
            <li>School affiliation</li>
          </ul>
          <h3>How it is used</h3>
          <p>To allow your child to view and bid on student artwork at school auctions.
          We do not sell or share this data with third parties.</p>
          <p><a href="${consentUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">Review &amp; Grant Consent</a></p>
          <p>If you did not expect this email, click the link above and choose <strong>Deny</strong>.</p>
          <p><small>This link expires in 7 days.</small></p>`;
        await emailProvider.send(parentEmail, subject, html, text);
        return;
      } catch (err) {
        console.error('Parent consent email send failed:', err.message);
      }
    }

    if (process.env.NODE_ENV !== 'test') {
      console.log(`[DEV] Parental consent link for ${parentEmail} (child: ${childFirstName}): ${consentUrl}`);
    }
  }

  /**
   * Create a session row in user_sessions for the refresh token just issued.
   * Non-fatal: any error is caught and swallowed so login/verify2FA still succeed.
   * If the oldest session was evicted to make room, its JTI is added to the blacklist.
   *
   * @param {string} userId
   * @param {string} refreshJti - JTI from the newly generated refresh token
   * @param {Object} req - Express request (for IP + user-agent)
   */
  async _createSessionRecord(userId, refreshJti, req) {
    if (!this.authService?.sessionService) return;
    try {
      const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const sessionResult = await this.authService.sessionService.createSession(userId, {
        tokenJti: refreshJti,
        tokenType: 'REFRESH',
        expiresAt: refreshExpiry,
        ipAddress: req?.ip || null,
        userAgent: req?.headers?.['user-agent'] || null,
        deviceFingerprint: null,
        twoFAVerified: false
      });
      // Evicted oldest session — add its JTI to the blacklist
      if (sessionResult?.revokedJti) {
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        await tokenBlacklist.revoke(sessionResult.revokedJti, new Date(Date.now() + sevenDaysMs));
      }
    } catch (_err) {
      // Session tracking failure is non-fatal
    }
  }
}

module.exports = UserController;

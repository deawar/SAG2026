/**
 * ============================================================================
 * Section 2: Core Backend Models & Services
 * Production-grade models with validation, business logic, compliance checks
 * ============================================================================
 */

const { Pool } = require('pg');
const crypto = require('crypto');
const validator = require('validator');

// Use Node.js built-in randomUUID instead of uuid package
const uuidv4 = () => crypto.randomUUID();

// ============================================================================
// 2.1 Database Connection Pool
// ============================================================================

// Create a shared pool instance for use in services
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  max: process.env.DB_POOL_MAX || 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

class Database {
  constructor(config) {
    // Use the shared pool or create a new one if config is provided
    this.pool = new Pool({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      database: config.database,
      max: config.maxConnections || 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }

  async query(sql, params = []) {
    const startTime = Date.now();
    try {
      const result = await this.pool.query(sql, params);
      const duration = Date.now() - startTime;
      
      // Log slow queries
      if (duration > 1000) {
        console.warn(`Slow query (${duration}ms):`, sql);
      }
      
      return result;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}

// ============================================================================
// 2.2 User Model
// ============================================================================

class UserModel {
  constructor(db) {
    this.db = db;
  }

  /**
   * Create a new user with full validation and encryption
   * @param {Object} userData - User registration data
   * @returns {Promise<Object>} - Created user object
   */
  async create(userData) {
    // Validation
    this._validateUserData(userData);

    const {
      email,
      password,
      firstName,
      lastName,
      phoneNumber,
      dateOfBirth,
      role,
      schoolId,
    } = userData;

    // Check if email already exists
    const existingUser = await this.db.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      throw new Error('EMAIL_ALREADY_EXISTS');
    }

    // Hash password with bcrypt (12 rounds)
    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash(password, 12);

    // Generate user ID
    const userId = uuidv4();

    // Insert user
    const result = await this.db.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, phone_number, date_of_birth, role, school_id, account_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE')
       RETURNING id, email, first_name, last_name, phone_number, role, school_id, created_at, account_status`,
      [userId, email.toLowerCase(), passwordHash, firstName, lastName, phoneNumber, dateOfBirth, role, schoolId]
    );

    return result.rows[0];
  }

  /**
   * Retrieve user by ID with sensitive field filtering
   * @param {string} userId - User UUID
   * @param {boolean} includeSensitive - Include password hash and 2FA
   * @returns {Promise<Object>} - User object
   */
  async getById(userId, includeSensitive = false) {
    const selectFields = includeSensitive 
      ? '*' 
      : 'id, email, first_name, last_name, phone_number, role, school_id, account_status, created_at, last_login';

    const result = await this.db.query(
      `SELECT ${selectFields} FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('USER_NOT_FOUND');
    }

    return result.rows[0];
  }

  /**
   * Get user by email (for login)
   * @param {string} email - User email
   * @returns {Promise<Object>} - User object with password hash
   */
  async getByEmail(email) {
    const result = await this.db.query(
      'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Update user profile (non-sensitive fields)
   * @param {string} userId - User UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} - Updated user
   */
  async update(userId, updates) {
    // Only allow specific fields to be updated
    const allowedFields = ['first_name', 'last_name', 'phone_number'];
    const filteredUpdates = {};

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });

    if (Object.keys(filteredUpdates).length === 0) {
      throw new Error('NO_VALID_UPDATES');
    }

    // Build dynamic UPDATE query
    const setClause = Object.keys(filteredUpdates)
      .map((key, index) => `${key} = $${index + 1}`)
      .join(', ');

    const result = await this.db.query(
      `UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $${Object.keys(filteredUpdates).length + 1} AND deleted_at IS NULL
       RETURNING id, email, first_name, last_name, phone_number, role, school_id, updated_at`,
      [...Object.values(filteredUpdates), userId]
    );

    if (result.rows.length === 0) {
      throw new Error('USER_NOT_FOUND');
    }

    return result.rows[0];
  }

  /**
   * Soft delete user (privacy-compliant)
   * @param {string} userId - User UUID
   * @returns {Promise<void>}
   */
  async delete(userId) {
    const result = await this.db.query(
      `UPDATE users SET deleted_at = CURRENT_TIMESTAMP, account_status = 'INACTIVE'
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    if (result.rowCount === 0) {
      throw new Error('USER_NOT_FOUND');
    }
  }

  /**
   * Check password (for login)
   * @param {string} plainPassword - Plain text password
   * @param {string} passwordHash - Hash from database
   * @returns {Promise<boolean>} - Password match result
   */
  async checkPassword(plainPassword, passwordHash) {
    const bcrypt = require('bcrypt');
    return await bcrypt.compare(plainPassword, passwordHash);
  }

  /**
   * Update password with validation
   * @param {string} userId - User UUID
   * @param {string} currentPassword - Current password for verification
   * @param {string} newPassword - New password
   * @returns {Promise<void>}
   */
  async updatePassword(userId, currentPassword, newPassword) {
    // Get current password hash
    const user = await this.getById(userId, true);

    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    // Verify current password
    const isValid = await this.checkPassword(currentPassword, user.password_hash);
    if (!isValid) {
      throw new Error('INVALID_CURRENT_PASSWORD');
    }

    // Validate new password
    this._validatePassword(newPassword);

    // Hash new password
    const bcrypt = require('bcrypt');
    const newHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await this.db.query(
      `UPDATE users SET password_hash = $1, password_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newHash, userId]
    );
  }

  /**
   * Update last login timestamp
   * @param {string} userId - User UUID
   * @returns {Promise<void>}
   */
  async updateLastLogin(userId) {
    await this.db.query(
      `UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1`,
      [userId]
    );
  }

  /**
   * Enable 2FA for user
   * @param {string} userId - User UUID
   * @returns {Promise<Object>} - Secret and backup codes
   */
  async enable2FA(userId) {
    const speakeasy = require('speakeasy');

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `Silent Auction (${userId})`,
      issuer: 'Silent Auction Gallery',
      length: 32,
    });

    // Generate backup codes
    const backupCodes = this._generateBackupCodes(8);

    // Store encrypted secret and backup codes
    const backupCodesEncrypted = this._encryptData(JSON.stringify(backupCodes));

    await this.db.query(
      `UPDATE users SET two_fa_secret = $1, backup_codes = $2, two_fa_enabled = TRUE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [secret.base32, backupCodesEncrypted, userId]
    );

    return {
      secret: secret.base32,
      qrCode: secret.otpauth_url,
      backupCodes,
    };
  }

  /**
   * Verify 2FA token
   * @param {string} userId - User UUID
   * @param {string} token - TOTP token
   * @returns {Promise<boolean>} - Token valid
   */
  async verify2FA(userId, token) {
    const speakeasy = require('speakeasy');
    const user = await this.getById(userId, true);

    if (!user || !user.two_fa_enabled) {
      throw new Error('2FA_NOT_ENABLED');
    }

    const verified = speakeasy.totp.verify({
      secret: user.two_fa_secret,
      encoding: 'base32',
      token: token,
      window: 2, // Allow for time drift
    });

    return verified;
  }

  /**
   * Check and increment failed login attempts
   * @param {string} userId - User UUID
   * @returns {Promise<{lockedUntil, attemptsRemaining}>}
   */
  async recordFailedLogin(userId) {
    const result = await this.db.query(
      `SELECT failed_login_attempts, account_locked_until FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('USER_NOT_FOUND');
    }

    let attempts = result.rows[0].failed_login_attempts + 1;
    let lockedUntil = result.rows[0].account_locked_until;

    // Lock account after 5 failed attempts for 30 minutes
    if (attempts >= 5) {
      lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
    }

    await this.db.query(
      `UPDATE users SET failed_login_attempts = $1, account_locked_until = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [attempts, lockedUntil, userId]
    );

    return {
      lockedUntil,
      attemptsRemaining: Math.max(0, 5 - attempts),
    };
  }

  /**
   * Reset failed login attempts on successful login
   * @param {string} userId - User UUID
   * @returns {Promise<void>}
   */
  async recordSuccessfulLogin(userId) {
    await this.db.query(
      `UPDATE users SET failed_login_attempts = 0, account_locked_until = NULL, last_login = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [userId]
    );
  }

  /**
   * Get users by role (for admin operations)
   * @param {string} role - User role
   * @param {string} schoolId - Filter by school (optional)
   * @param {number} limit - Result limit
   * @param {number} offset - Result offset
   * @returns {Promise<Array>} - Users array
   */
  async getByRole(role, schoolId = null, limit = 100, offset = 0) {
    let query = 'SELECT id, email, first_name, last_name, role, school_id, account_status, created_at FROM users WHERE role = $1 AND deleted_at IS NULL';
    const params = [role];

    if (schoolId) {
      query += ' AND school_id = $2';
      params.push(schoolId);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await this.db.query(query, params);
    return result.rows;
  }

  /**
   * Check account status and lockout
   * @param {string} userId - User UUID
   * @returns {Promise<{isLocked, status}>}
   */
  async checkAccountStatus(userId) {
    const result = await this.db.query(
      `SELECT account_status, account_locked_until FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('USER_NOT_FOUND');
    }

    const user = result.rows[0];
    const isLocked = user.account_locked_until && user.account_locked_until > new Date();

    return {
      isLocked,
      status: user.account_status,
      lockedUntil: user.account_locked_until,
    };
  }

  // ========================================================================
  // Private Validation Methods
  // ========================================================================

  _validateUserData(userData) {
    const { email, password, firstName, lastName, role, dateOfBirth } = userData;

    // Email validation
    if (!email || !validator.isEmail(email)) {
      throw new Error('INVALID_EMAIL');
    }

    // Password validation
    this._validatePassword(password);

    // Name validation
    if (!firstName || firstName.length < 2 || firstName.length > 100) {
      throw new Error('INVALID_FIRST_NAME');
    }

    if (!lastName || lastName.length < 2 || lastName.length > 100) {
      throw new Error('INVALID_LAST_NAME');
    }

    // Role validation
    const validRoles = ['SITE_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'BIDDER'];
    if (!role || !validRoles.includes(role)) {
      throw new Error('INVALID_ROLE');
    }

    // COPPA: Age verification for students
    if ((role === 'STUDENT' || role === 'BIDDER') && dateOfBirth) {
      const age = this._calculateAge(dateOfBirth);
      if (age < 13) {
        throw new Error('COPPA_PARENTAL_CONSENT_REQUIRED');
      }
    }
  }

  _validatePassword(password) {
    if (!password || password.length < 12) {
      throw new Error('PASSWORD_TOO_SHORT');
    }

    if (!/[A-Z]/.test(password)) {
      throw new Error('PASSWORD_MISSING_UPPERCASE');
    }

    if (!/[a-z]/.test(password)) {
      throw new Error('PASSWORD_MISSING_LOWERCASE');
    }

    if (!/[0-9]/.test(password)) {
      throw new Error('PASSWORD_MISSING_NUMBER');
    }

    if (!/[!@#$%^&*]/.test(password)) {
      throw new Error('PASSWORD_MISSING_SPECIAL_CHAR');
    }

    // Check against common passwords
    const commonPasswords = ['Password1!', 'Qwerty123!', 'Admin1234!'];
    if (commonPasswords.includes(password)) {
      throw new Error('PASSWORD_TOO_COMMON');
    }
  }

  _calculateAge(dateOfBirth) {
    const today = new Date();
    let age = today.getFullYear() - dateOfBirth.getFullYear();
    const monthDiff = today.getMonth() - dateOfBirth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
      age--;
    }

    return age;
  }

  _generateBackupCodes(count) {
    const codes = [];
    for (let i = 0; i < count; i++) {
      codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }
    return codes;
  }

  _encryptData(data) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key', 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  _decryptData(encrypted) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key', 'salt', 32);
    const parts = encrypted.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(parts[1], 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

// ============================================================================
// 2.3 School Model
// ============================================================================

class SchoolModel {
  constructor(db) {
    this.db = db;
  }

  async create(schoolData, adminUserId) {
    const { name, district, address, city, state, postalCode, country, phone, website } = schoolData;

    // Validation
    if (!name || name.length < 3) {
      throw new Error('INVALID_SCHOOL_NAME');
    }

    if (!validator.isURL(website)) {
      throw new Error('INVALID_WEBSITE_URL');
    }

    const schoolId = uuidv4();

    const result = await this.db.query(
      `INSERT INTO schools (id, name, district, address_line1, city, state_province, postal_code, country, phone_number, website_url, primary_contact_user_id, account_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PENDING_VERIFICATION')
       RETURNING id, name, district, account_status, created_at`,
      [schoolId, name, district, address, city, state, postalCode, country, phone, website, adminUserId]
    );

    return result.rows[0];
  }

  async getById(schoolId) {
    const result = await this.db.query(
      'SELECT * FROM schools WHERE id = $1',
      [schoolId]
    );

    if (result.rows.length === 0) {
      throw new Error('SCHOOL_NOT_FOUND');
    }

    return result.rows[0];
  }

  async update(schoolId, updates) {
    const allowedFields = ['name', 'district', 'address_line1', 'address_line2', 'city', 'state_province', 'postal_code', 'phone_number', 'website_url'];
    const filteredUpdates = {};

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });

    if (Object.keys(filteredUpdates).length === 0) {
      throw new Error('NO_VALID_UPDATES');
    }

    const setClause = Object.keys(filteredUpdates)
      .map((key, index) => `${key} = $${index + 1}`)
      .join(', ');

    const result = await this.db.query(
      `UPDATE schools SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $${Object.keys(filteredUpdates).length + 1}
       RETURNING *`,
      [...Object.values(filteredUpdates), schoolId]
    );

    if (result.rows.length === 0) {
      throw new Error('SCHOOL_NOT_FOUND');
    }

    return result.rows[0];
  }

  async verify(schoolId) {
    const result = await this.db.query(
      `UPDATE schools SET account_status = 'ACTIVE', verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [schoolId]
    );

    if (result.rows.length === 0) {
      throw new Error('SCHOOL_NOT_FOUND');
    }

    return result.rows[0];
  }

  async getAdmins(schoolId) {
    const result = await this.db.query(
      `SELECT id, email, first_name, last_name, created_at FROM users 
       WHERE school_id = $1 AND role = 'SCHOOL_ADMIN' AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [schoolId]
    );

    return result.rows;
  }

  async getTeachers(schoolId) {
    const result = await this.db.query(
      `SELECT id, email, first_name, last_name, created_at FROM users 
       WHERE school_id = $1 AND role = 'TEACHER' AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [schoolId]
    );

    return result.rows;
  }

  async getStudents(schoolId) {
    const result = await this.db.query(
      `SELECT id, email, first_name, last_name, created_at FROM users 
       WHERE school_id = $1 AND role = 'STUDENT' AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [schoolId]
    );

    return result.rows;
  }
}

// ============================================================================
// 2.4 Auction Model
// ============================================================================

class AuctionModel {
  constructor(db) {
    this.db = db;
  }

  async create(auctionData, createdByUserId) {
    const {
      schoolId,
      title,
      description,
      startsAt,
      endsAt,
      paymentGatewayId,
      platformFeePercentage,
      visibility,
    } = auctionData;

    // Validation
    if (!title || title.length < 3) {
      throw new Error('INVALID_AUCTION_TITLE');
    }

    if (!startsAt || !endsAt) {
      throw new Error('INVALID_AUCTION_DATES');
    }

    if (new Date(startsAt) >= new Date(endsAt)) {
      throw new Error('INVALID_DATE_RANGE');
    }

    if (platformFeePercentage < 0 || platformFeePercentage > 100) {
      throw new Error('INVALID_PLATFORM_FEE');
    }

    const auctionId = uuidv4();

    const result = await this.db.query(
      `INSERT INTO auctions (id, school_id, title, description, starts_at, ends_at, created_by_user_id, payment_gateway_id, platform_fee_percentage, visibility, auction_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'DRAFT')
       RETURNING id, title, auction_status, starts_at, ends_at, created_at`,
      [auctionId, schoolId, title, description, startsAt, endsAt, createdByUserId, paymentGatewayId, platformFeePercentage, visibility]
    );

    return result.rows[0];
  }

  async getById(auctionId) {
    const result = await this.db.query(
      'SELECT * FROM auctions WHERE id = $1 AND deleted_at IS NULL',
      [auctionId]
    );

    if (result.rows.length === 0) {
      throw new Error('AUCTION_NOT_FOUND');
    }

    return result.rows[0];
  }

  async update(auctionId, updates) {
    const allowedFields = ['title', 'description', 'platform_fee_percentage', 'visibility', 'charity_beneficiary_name', 'charity_website_url'];
    const filteredUpdates = {};

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });

    if (Object.keys(filteredUpdates).length === 0) {
      throw new Error('NO_VALID_UPDATES');
    }

    const setClause = Object.keys(filteredUpdates)
      .map((key, index) => `${key} = $${index + 1}`)
      .join(', ');

    const result = await this.db.query(
      `UPDATE auctions SET ${setClause}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${Object.keys(filteredUpdates).length + 1} AND auction_status = 'DRAFT'
       RETURNING *`,
      [...Object.values(filteredUpdates), auctionId]
    );

    if (result.rows.length === 0) {
      throw new Error('AUCTION_NOT_FOUND_OR_NOT_DRAFT');
    }

    return result.rows[0];
  }

  async submit(auctionId) {
    const result = await this.db.query(
      `UPDATE auctions SET auction_status = 'PENDING_APPROVAL', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND auction_status = 'DRAFT'
       RETURNING *`,
      [auctionId]
    );

    if (result.rows.length === 0) {
      throw new Error('AUCTION_NOT_IN_DRAFT_STATE');
    }

    return result.rows[0];
  }

  async approve(auctionId, approvedByUserId, notes = '') {
    const result = await this.db.query(
      `UPDATE auctions SET auction_status = 'APPROVED', approved_by_user_id = $1, approval_notes = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND auction_status = 'PENDING_APPROVAL'
       RETURNING *`,
      [approvedByUserId, notes, auctionId]
    );

    if (result.rows.length === 0) {
      throw new Error('AUCTION_NOT_PENDING_APPROVAL');
    }

    return result.rows[0];
  }

  async start(auctionId) {
    const result = await this.db.query(
      `UPDATE auctions SET auction_status = 'LIVE', published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND auction_status IN ('APPROVED')
       RETURNING *`,
      [auctionId]
    );

    if (result.rows.length === 0) {
      throw new Error('AUCTION_NOT_APPROVED');
    }

    return result.rows[0];
  }

  async end(auctionId) {
    const result = await this.db.query(
      `UPDATE auctions SET auction_status = 'ENDED', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND auction_status = 'LIVE'
       RETURNING *`,
      [auctionId]
    );

    if (result.rows.length === 0) {
      throw new Error('AUCTION_NOT_LIVE');
    }

    return result.rows[0];
  }

  async getBySchool(schoolId, status = null, limit = 50, offset = 0) {
    let query = 'SELECT * FROM auctions WHERE school_id = $1 AND deleted_at IS NULL';
    const params = [schoolId];

    if (status) {
      query += ' AND auction_status = $2';
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await this.db.query(query, params);
    return result.rows;
  }

  async getActive() {
    const result = await this.db.query(
      `SELECT * FROM auctions 
       WHERE auction_status = 'LIVE'
       AND starts_at <= CURRENT_TIMESTAMP
       AND ends_at > CURRENT_TIMESTAMP
       AND deleted_at IS NULL
       ORDER BY ends_at ASC`
    );

    return result.rows;
  }

  async getExpired() {
    const result = await this.db.query(
      `SELECT * FROM auctions 
       WHERE auction_status = 'LIVE'
       AND ends_at <= CURRENT_TIMESTAMP
       AND deleted_at IS NULL`
    );

    return result.rows;
  }

  async calculatePlatformFee(auctionId, hammerAmount) {
    const auction = await this.getById(auctionId);

    let fee = (hammerAmount * auction.platform_fee_percentage) / 100;

    // Apply minimum fee
    if (fee < auction.platform_fee_minimum) {
      fee = auction.platform_fee_minimum;
    }

    return {
      hammerAmount,
      platformFee: fee,
      totalAmount: hammerAmount + fee,
    };
  }
}

// ============================================================================
// 2.5 Artwork Model
// ============================================================================

class ArtworkModel {
  constructor(db) {
    this.db = db;
  }

  async create(artworkData, createdByUserId) {
    const {
      auctionId,
      title,
      description,
      artistName,
      artistGrade,
      medium,
      width,
      height,
      depth,
      estimatedValue,
      startingBidAmount,
      reserveBidAmount,
      imageUrl,
    } = artworkData;

    // Validation
    if (!title || title.length < 3) {
      throw new Error('INVALID_ARTWORK_TITLE');
    }

    if (!artistName || artistName.length < 2) {
      throw new Error('INVALID_ARTIST_NAME');
    }

    if (startingBidAmount < 0) {
      throw new Error('INVALID_STARTING_BID');
    }

    if (reserveBidAmount && reserveBidAmount < startingBidAmount) {
      throw new Error('INVALID_RESERVE_BID');
    }

    const artworkId = uuidv4();

    const result = await this.db.query(
      `INSERT INTO artwork (id, auction_id, created_by_user_id, title, description, artist_name, artist_grade, medium, 
                            dimensions_width_cm, dimensions_height_cm, dimensions_depth_cm, estimated_value, 
                            starting_bid_amount, reserve_bid_amount, image_url, artwork_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'DRAFT')
       RETURNING id, title, artwork_status, starting_bid_amount, created_at`,
      [artworkId, auctionId, createdByUserId, title, description, artistName, artistGrade, medium,
       width, height, depth, estimatedValue, startingBidAmount, reserveBidAmount, imageUrl]
    );

    return result.rows[0];
  }

  async getById(artworkId) {
    const result = await this.db.query(
      'SELECT * FROM artwork WHERE id = $1 AND deleted_at IS NULL',
      [artworkId]
    );

    if (result.rows.length === 0) {
      throw new Error('ARTWORK_NOT_FOUND');
    }

    return result.rows[0];
  }

  async submit(artworkId) {
    const result = await this.db.query(
      `UPDATE artwork SET artwork_status = 'SUBMITTED', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND artwork_status = 'DRAFT'
       RETURNING *`,
      [artworkId]
    );

    if (result.rows.length === 0) {
      throw new Error('ARTWORK_NOT_IN_DRAFT_STATE');
    }

    return result.rows[0];
  }

  async approve(artworkId, approvedByUserId) {
    const result = await this.db.query(
      `UPDATE artwork SET artwork_status = 'APPROVED', approved_by_user_id = $1, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND artwork_status = 'SUBMITTED'
       RETURNING *`,
      [approvedByUserId, artworkId]
    );

    if (result.rows.length === 0) {
      throw new Error('ARTWORK_NOT_SUBMITTED');
    }

    return result.rows[0];
  }

  async reject(artworkId, approvedByUserId, rejectionReason) {
    const result = await this.db.query(
      `UPDATE artwork SET artwork_status = 'REJECTED', approved_by_user_id = $1, rejection_reason = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND artwork_status IN ('SUBMITTED', 'PENDING_APPROVAL')
       RETURNING *`,
      [approvedByUserId, rejectionReason, artworkId]
    );

    if (result.rows.length === 0) {
      throw new Error('ARTWORK_NOT_IN_APPROVABLE_STATE');
    }

    return result.rows[0];
  }

  async getByAuction(auctionId, status = null) {
    let query = 'SELECT * FROM artwork WHERE auction_id = $1 AND deleted_at IS NULL';
    const params = [auctionId];

    if (status) {
      query += ' AND artwork_status = $2';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.db.query(query, params);
    return result.rows;
  }

  async getHighestBid(artworkId) {
    const result = await this.db.query(
      `SELECT MAX(bid_amount) as highest_bid, COUNT(*) as total_bids
       FROM bids
       WHERE artwork_id = $1 AND bid_status = 'ACTIVE'`,
      [artworkId]
    );

    return result.rows[0];
  }

  async markAsSold(artworkId, winnerUserId, finalBidAmount) {
    const result = await this.db.query(
      `UPDATE artwork SET artwork_status = 'SOLD', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND artwork_status IN ('APPROVED')
       RETURNING *`,
      [artworkId]
    );

    if (result.rows.length === 0) {
      throw new Error('ARTWORK_NOT_IN_SELLABLE_STATE');
    }

    return result.rows[0];
  }
}

// ============================================================================
// 2.6 Bid Model
// ============================================================================

class BidModel {
  constructor(db) {
    this.db = db;
  }

  async placeBid(bidData, placedByUserId) {
    const {
      auctionId,
      artworkId,
      bidAmount,
      isAutoBid,
      autoMaxAmount,
      ipAddress,
      userAgent,
    } = bidData;

    // Validation
    if (bidAmount <= 0) {
      throw new Error('INVALID_BID_AMOUNT');
    }

    if (isAutoBid && (!autoMaxAmount || autoMaxAmount < bidAmount)) {
      throw new Error('INVALID_AUTO_BID_AMOUNT');
    }

    // Get artwork for validation
    const artwork = await this.db.query('SELECT * FROM artwork WHERE id = $1', [artworkId]);
    if (artwork.rows.length === 0) {
      throw new Error('ARTWORK_NOT_FOUND');
    }

    // Check if bid meets minimum
    if (bidAmount < artwork.rows[0].starting_bid_amount) {
      throw new Error('BID_BELOW_STARTING_AMOUNT');
    }

    // Get highest current bid
    const highestBidResult = await this.db.query(
      `SELECT bid_amount FROM bids 
       WHERE artwork_id = $1 AND bid_status = 'ACTIVE'
       ORDER BY bid_amount DESC LIMIT 1`,
      [artworkId]
    );

    if (highestBidResult.rows.length > 0) {
      const highestBid = highestBidResult.rows[0].bid_amount;
      if (bidAmount <= highestBid) {
        throw new Error('BID_NOT_HIGHER_THAN_CURRENT');
      }
    }

    const bidId = uuidv4();

    // Insert bid
    const result = await this.db.query(
      `INSERT INTO bids (id, auction_id, artwork_id, placed_by_user_id, bid_amount, is_auto_bid, auto_bid_max_amount, bid_status, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8, $9)
       RETURNING id, bid_amount, placed_at, bid_status`,
      [bidId, auctionId, artworkId, placedByUserId, bidAmount, isAutoBid, autoMaxAmount, ipAddress, userAgent]
    );

    return result.rows[0];
  }

  async getById(bidId) {
    const result = await this.db.query('SELECT * FROM bids WHERE id = $1', [bidId]);

    if (result.rows.length === 0) {
      throw new Error('BID_NOT_FOUND');
    }

    return result.rows[0];
  }

  async getHighestBid(artworkId) {
    const result = await this.db.query(
      `SELECT * FROM bids 
       WHERE artwork_id = $1 AND bid_status = 'ACTIVE'
       ORDER BY bid_amount DESC LIMIT 1`,
      [artworkId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  async getBidsForArtwork(artworkId) {
    const result = await this.db.query(
      `SELECT id, bid_amount, placed_by_user_id, placed_at, bid_status, is_auto_bid
       FROM bids
       WHERE artwork_id = $1 AND bid_status = 'ACTIVE'
       ORDER BY bid_amount DESC`,
      [artworkId]
    );

    return result.rows;
  }

  async getBidsForUser(userId) {
    const result = await this.db.query(
      `SELECT id, bid_amount, artwork_id, auction_id, placed_at, bid_status
       FROM bids
       WHERE placed_by_user_id = $1
       ORDER BY placed_at DESC`,
      [userId]
    );

    return result.rows;
  }

  async outbidPreviousBids(artworkId, newHighestBidId) {
    const result = await this.db.query(
      `UPDATE bids SET bid_status = 'OUTBID', updated_at = CURRENT_TIMESTAMP
       WHERE artwork_id = $1 AND id != $2 AND bid_status = 'ACTIVE'`,
      [artworkId, newHighestBidId]
    );

    return result.rowCount;
  }

  async acceptBid(bidId) {
    const result = await this.db.query(
      `UPDATE bids SET bid_status = 'ACCEPTED', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [bidId]
    );

    if (result.rows.length === 0) {
      throw new Error('BID_NOT_FOUND');
    }

    return result.rows[0];
  }

  async rejectBid(bidId) {
    const result = await this.db.query(
      `UPDATE bids SET bid_status = 'REJECTED', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [bidId]
    );

    if (result.rows.length === 0) {
      throw new Error('BID_NOT_FOUND');
    }

    return result.rows[0];
  }
}

// ============================================================================
// Export Models
// ============================================================================

module.exports = {
  pool,
  Database,
  UserModel,
  SchoolModel,
  AuctionModel,
  ArtworkModel,
  BidModel,
};

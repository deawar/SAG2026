/**
 * ============================================================================
 * Input Validation & Sanitization Utilities
 * Prevents SQL injection, XSS, and other input-based attacks
 * ============================================================================
 */

class ValidationUtils {
  /**
   * Sanitize string input - remove dangerous characters
   * @param {string} input - Raw input string
   * @param {number} maxLength - Maximum allowed length (default 1000)
   * @returns {string} - Sanitized string
   */
  static sanitizeString(input, maxLength = 1000) {
    if (typeof input !== 'string') return '';

    // 1. Remove null bytes
    let sanitized = input.replace(/\x00/g, '');

    // 2. Trim whitespace
    sanitized = sanitized.trim();

    // 3. Enforce maximum length
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized;
  }

  /**
   * Validate email format
   * @param {string} email - Email address to validate
   * @returns {boolean} - True if valid email
   */
  static validateEmail(email) {
    if (!email || typeof email !== 'string') return false;

    const sanitized = this.sanitizeString(email, 254);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return emailRegex.test(sanitized);
  }

  /**
   * Validate password strength
   * Requirements: 12+ chars, uppercase, lowercase, number, special char
   * @param {string} password - Password to validate
   * @returns {boolean} - True if meets all requirements
   */
  static validatePassword(password) {
    if (!password || typeof password !== 'string') return false;

    const requirements = {
      minLength: password.length >= 12,
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumbers: /\d/.test(password),
      hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    };

    // All requirements must be met
    return Object.values(requirements).every(req => req);
  }

  /**
   * Validate UUID format
   * @param {string} id - UUID to validate
   * @returns {boolean} - True if valid UUID v4
   */
  static validateUUID(id) {
    if (!id || typeof id !== 'string') return false;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }

  /**
   * Validate URL (prevent XSS via redirect)
   * Only allows http/https protocols
   * @param {string} url - URL to validate
   * @returns {boolean} - True if valid http/https URL
   */
  static validateURL(url) {
    if (!url || typeof url !== 'string') return false;

    try {
      const parsed = new URL(url);
      // Only allow http/https
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (error) {
      return false;
    }
  }

  /**
   * Sanitize search query - prevent SQL injection in LIKE clauses
   * @param {string} query - Raw search query
   * @returns {string} - Sanitized query
   */
  static sanitizeSearchQuery(query) {
    if (!query || typeof query !== 'string') return '';

    // Remove SQL keywords and dangerous characters
    const sanitized = query
      .replace(/[;'"`]/g, '')      // Remove quote chars
      .replace(/--/g, '')           // Remove SQL comment
      .replace(/\/\*/g, '')         // Remove comment start
      .replace(/\*\//g, '')         // Remove comment end
      .replace(/xp_/g, '')          // Remove extended stored procedures
      .replace(/sp_/g, '')          // Remove system stored procedures
      .trim();

    return this.sanitizeString(sanitized, 100);
  }

  /**
   * Validate numeric value
   * @param {number} value - Value to validate
   * @param {number} min - Minimum allowed value
   * @param {number} max - Maximum allowed value
   * @returns {boolean} - True if value within range
   */
  static validateNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    if (typeof value !== 'number' || isNaN(value)) return false;

    return value >= min && value <= max;
  }

  /**
   * Validate positive amount (for payments)
   * @param {number} amount - Amount to validate
   * @returns {boolean} - True if positive decimal number
   */
  static validateAmount(amount) {
    if (typeof amount !== 'number') return false;

    // Must be positive and max 2 decimal places (cents)
    return amount > 0 && amount <= 999999.99;
  }

  /**
   * HTML encode string for safe display (prevent XSS)
   * @param {string} str - String to encode
   * @returns {string} - HTML-encoded string
   */
  static htmlEncode(str) {
    if (!str || typeof str !== 'string') return '';

    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * HTML decode string (reverse of htmlEncode)
   * @param {string} str - String to decode
   * @returns {string} - Decoded string
   */
  static htmlDecode(str) {
    if (!str || typeof str !== 'string') return '';

    const entities = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'"
    };

    return str.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, match => entities[match]);
  }

  /**
   * Validate role from allowed list
   * @param {string} role - Role to validate
   * @param {string[]} allowedRoles - List of valid roles
   * @returns {boolean} - True if role is valid
   */
  static validateRole(role, allowedRoles = ['SITE_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'BIDDER']) {
    if (!role || typeof role !== 'string') return false;

    return allowedRoles.includes(role);
  }

  /**
   * Validate auction status
   * @param {string} status - Status to validate
   * @returns {boolean} - True if valid status
   */
  static validateAuctionStatus(status) {
    const validStatuses = ['DRAFT', 'APPROVED', 'LIVE', 'CLOSED', 'CANCELLED'];
    return validStatuses.includes(status);
  }

  /**
   * Sanitize input object - recursively sanitize all string properties
   * @param {object} obj - Object to sanitize
   * @param {number} maxDepth - Maximum recursion depth
   * @returns {object} - Sanitized object
   */
  static sanitizeObject(obj, maxDepth = 3) {
    if (maxDepth <= 0) return obj;
    if (obj === null || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item, maxDepth - 1));
    }

    const sanitized = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];

        if (typeof value === 'string') {
          sanitized[key] = this.sanitizeString(value);
        } else if (typeof value === 'object') {
          sanitized[key] = this.sanitizeObject(value, maxDepth - 1);
        } else {
          sanitized[key] = value;
        }
      }
    }

    return sanitized;
  }
}

module.exports = ValidationUtils;

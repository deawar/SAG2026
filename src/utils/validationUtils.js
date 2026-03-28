/**
 * Validation utility functions
 */

const ValidationUtils = {
  /**
   * Validate email format
   */
  validateEmail(email) {
    if (typeof email !== 'string') {return false;}
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  },

  /**
   * Alias for validateEmail (used in teacherController)
   */
  isValidEmail(email) {
    return ValidationUtils.validateEmail(email);
  },

  /**
   * Validate password strength
   * Requires: 12+ chars, uppercase, lowercase, number, special character
   */
  validatePassword(password) {
    if (typeof password !== 'string' || password.length < 12) {return false;}
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
    return hasUppercase && hasLowercase && hasNumber && hasSpecial;
  },

  /**
   * Sanitize a string: trim whitespace and truncate to maxLength
   */
  sanitizeString(str, maxLength) {
    if (typeof str !== 'string') {return '';}
    return str.trim().slice(0, maxLength);
  },

  /**
   * Validate UUID v4 format
   */
  validateUUID(uuid) {
    if (typeof uuid !== 'string') {return false;}
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
  },

  /**
   * Validate payment amount: positive number, max $999,999.99
   */
  validateAmount(amount) {
    const num = Number(amount);
    return Number.isFinite(num) && num > 0 && num <= 999999.99;
  }
};

module.exports = ValidationUtils;

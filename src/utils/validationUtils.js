/**
 * Validation utility functions
 */

const ValidationUtils = {
  isValidEmail(email) {
    if (typeof email !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }
};

module.exports = ValidationUtils;

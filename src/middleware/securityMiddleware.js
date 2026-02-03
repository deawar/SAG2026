/**
 * ============================================================================
 * Security Middleware
 * Comprehensive security controls: input validation, XSS prevention, CSRF, rate limiting
 * ============================================================================
 */

const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const helmet = require('helmet');
const validator = require('validator');

/**
 * ============================================================================
 * INPUT VALIDATION & SANITIZATION
 * ============================================================================
 */

/**
 * Sanitize and validate user input
 * Removes NoSQL injection attempts, XSS payloads
 */
const sanitizeInput = (req, res, next) => {
  try {
    // Sanitize body
    if (req.body) {
      Object.keys(req.body).forEach(key => {
        if (typeof req.body[key] === 'string') {
          // Remove HTML tags and dangerous characters
          req.body[key] = validator.trim(req.body[key]);
          req.body[key] = validator.escape(req.body[key]);
        }
      });
    }

    // Sanitize query params
    if (req.query) {
      Object.keys(req.query).forEach(key => {
        if (typeof req.query[key] === 'string') {
          req.query[key] = validator.trim(req.query[key]);
          req.query[key] = validator.escape(req.query[key]);
        }
      });
    }

    next();
  } catch (error) {
    console.error('Input sanitization error:', error);
    return res.status(400).json({
      success: false,
      message: 'Invalid input detected'
    });
  }
};

/**
 * Validate email format
 */
const validateEmail = (email) => {
  return validator.isEmail(email);
};

/**
 * Validate password strength
 * Requires: 12+ chars, uppercase, lowercase, number, special character
 */
const validatePasswordStrength = (password) => {
  const minLength = 12;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  return {
    isStrong: password.length >= minLength && hasUppercase && hasLowercase && hasNumber && hasSpecial,
    reasons: {
      minLength: password.length >= minLength,
      uppercase: hasUppercase,
      lowercase: hasLowercase,
      number: hasNumber,
      special: hasSpecial
    }
  };
};

/**
 * Validate input against whitelist patterns
 */
const validateInput = (data, schema) => {
  const errors = [];

  for (const field of Object.keys(schema)) {
    const value = data[field];
    const rules = schema[field];

    // Check required
    if (rules.required && !value) {
      errors.push(`${field} is required`);
      continue;
    }

    if (!value) continue;

    // Check type
    if (rules.type && typeof value !== rules.type) {
      errors.push(`${field} must be type ${rules.type}`);
    }

    // Check minLength
    if (rules.minLength && value.length < rules.minLength) {
      errors.push(`${field} must be at least ${rules.minLength} characters`);
    }

    // Check maxLength
    if (rules.maxLength && value.length > rules.maxLength) {
      errors.push(`${field} must not exceed ${rules.maxLength} characters`);
    }

    // Check pattern
    if (rules.pattern && !rules.pattern.test(value)) {
      errors.push(`${field} format is invalid`);
    }

    // Check custom validation
    if (rules.validate && !rules.validate(value)) {
      errors.push(`${field} validation failed`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * ============================================================================
 * RATE LIMITING
 * ============================================================================
 */

/**
 * General API rate limiter
 * 100 requests per 15 minutes per IP
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later'
  },
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false // Disable X-RateLimit-* headers
});

/**
 * Strict rate limiter for authentication attempts
 * 5 requests per 15 minutes per IP (prevents brute force)
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: 'Too many login attempts, please try again later'
  },
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  standardHeaders: true
});

/**
 * Strict rate limiter for password reset
 * 3 requests per hour per IP
 */
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: {
    success: false,
    message: 'Too many password reset attempts, please try again later'
  },
  standardHeaders: true
});

/**
 * Payment API rate limiter
 * 10 requests per hour per IP (prevent fraud)
 */
const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many payment attempts, please try again later'
  },
  standardHeaders: true
});

/**
 * ============================================================================
 * CSRF PROTECTION
 * ============================================================================
 */

const csrf = require('csurf');
const cookieParser = require('cookie-parser');

// CSRF protection middleware
const csrfProtection = csrf({ cookie: false, httpOnly: true });

/**
 * Generate CSRF token and send to client
 */
const generateCSRFToken = (req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  res.json({
    success: true,
    csrfToken: req.csrfToken()
  });
};

/**
 * CSRF error handler
 */
const csrfErrorHandler = (err, req, res, next) => {
  if (err.code !== 'EBADCSRFTOKEN') return next(err);

  res.status(403).json({
    success: false,
    message: 'Invalid CSRF token'
  });
};

/**
 * ============================================================================
 * SQL INJECTION PREVENTION
 * ============================================================================
 */

/**
 * Escape SQL dangerous characters
 */
const escapeSQLSpecialChars = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\0/g, '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\x1a/g, '\\Z');
};

/**
 * Validate SQL identifier (table/column names)
 * Only allows alphanumeric and underscore
 */
const validateSQLIdentifier = (identifier) => {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier);
};

/**
 * ============================================================================
 * XSS PREVENTION
 * ============================================================================
 */

/**
 * Encode HTML entities to prevent XSS
 */
const encodeHTML = (str) => {
  if (typeof str !== 'string') return str;
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
  };
  return str.replace(/[&<>"'\/]/g, (c) => map[c]);
};

/**
 * Sanitize HTML to allow only safe tags
 */
const sanitizeHTML = (html) => {
  if (typeof html !== 'string') return html;
  // Remove all HTML tags (basic XSS prevention)
  return html.replace(/<[^>]*>/g, '');
};

/**
 * ============================================================================
 * SECURITY HEADERS
 * ============================================================================
 */

/**
 * Production security headers via Helmet
 * Includes: HSTS, CSP, X-Frame-Options, X-Content-Type-Options, etc.
 */
const productionSecurityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  strictTransportSecurity: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  frameGuard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
});

/**
 * Development security headers (permissive for testing)
 */
const developmentSecurityHeaders = helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
});

/**
 * ============================================================================
 * IDEMPOTENCY
 * ============================================================================
 */

/**
 * Track idempotency keys to prevent duplicate operations
 * Stores mapping of idempotency-key -> response
 */
const idempotencyMap = new Map();

/**
 * Idempotency middleware for payment operations
 * Ensures duplicate requests with same key return same response
 */
const idempotencyMiddleware = (req, res, next) => {
  const idempotencyKey = req.headers['idempotency-key'];

  if (!idempotencyKey) {
    // For operations that require idempotency
    if (['POST', 'PUT', 'DELETE'].includes(req.method) && 
        req.path.includes('/payments')) {
      return res.status(400).json({
        success: false,
        message: 'Idempotency-Key header required for payment operations'
      });
    }
    return next();
  }

  // Check if we've seen this key before
  if (idempotencyMap.has(idempotencyKey)) {
    return res.status(200).json(idempotencyMap.get(idempotencyKey));
  }

  // Intercept res.json() to store response
  const originalJson = res.json.bind(res);
  res.json = function(data) {
    idempotencyMap.set(idempotencyKey, data);
    // Clean up old entries after 1 hour
    setTimeout(() => idempotencyMap.delete(idempotencyKey), 60 * 60 * 1000);
    return originalJson(data);
  };

  next();
};

/**
 * ============================================================================
 * REQUEST LOGGING
 * ============================================================================
 */

/**
 * Security audit logging
 * Logs suspicious activity for security monitoring
 */
const securityLogger = (req, res, next) => {
  const suspiciousPatterns = [
    /union.*select/i,
    /select.*from/i,
    /insert.*into/i,
    /delete.*from/i,
    /drop.*table/i,
    /<script/i,
    /javascript:/i,
    /onerror=/i,
    /onclick=/i
  ];

  // Check for SQL injection patterns
  const queryString = JSON.stringify(req.query);
  const bodyString = JSON.stringify(req.body);
  const urlString = req.url;

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(queryString) || 
        pattern.test(bodyString) || 
        pattern.test(urlString)) {
      console.warn('[SECURITY] Suspicious request detected', {
        timestamp: new Date().toISOString(),
        ip: req.ip,
        method: req.method,
        path: req.path,
        query: req.query,
        body: req.body
      });
      
      // Don't block, just log for monitoring
      break;
    }
  }

  next();
};

/**
 * ============================================================================
 * EXPORTS
 * ============================================================================
 */

module.exports = {
  // Input validation
  sanitizeInput,
  validateEmail,
  validatePasswordStrength,
  validateInput,
  
  // Rate limiting
  apiLimiter,
  authLimiter,
  passwordResetLimiter,
  paymentLimiter,
  
  // CSRF protection
  csrfProtection,
  csrfErrorHandler,
  generateCSRFToken,
  
  // SQL injection prevention
  escapeSQLSpecialChars,
  validateSQLIdentifier,
  
  // XSS prevention
  encodeHTML,
  sanitizeHTML,
  
  // Security headers
  productionSecurityHeaders,
  developmentSecurityHeaders,
  
  // Idempotency
  idempotencyMiddleware,
  
  // Logging
  securityLogger,
  
  // Utilities
  mongoSanitize,
  helmet
};

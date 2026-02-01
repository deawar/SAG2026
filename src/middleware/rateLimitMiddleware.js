/**
 * ============================================================================
 * Rate Limiting Middleware
 * Prevents brute force attacks, DoS attacks, and resource exhaustion
 * ============================================================================
 */

const rateLimit = require('express-rate-limit');

/**
 * Login Rate Limiter
 * - 5 attempts per 15 minutes per IP
 * - Prevents password brute force
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many login attempts from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req) => process.env.NODE_ENV === 'test', // Skip rate limiting in test mode
  handler: (req, res) => {
    return res.status(429).json({
      success: false,
      message: 'Too many login attempts, please try again later'
    });
  }
});

/**
 * API Rate Limiter
 * - 100 requests per minute per IP
 * - General API endpoint protection
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per minute
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test',
  handler: (req, res) => {
    return res.status(429).json({
      success: false,
      message: 'Too many requests, please try again later'
    });
  }
});

/**
 * Payment Rate Limiter
 * - 10 requests per minute per IP
 * - Strict limit to prevent payment fraud/DoS
 */
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 requests per minute
  message: 'Too many payment requests from this IP.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test',
  handler: (req, res) => {
    return res.status(429).json({
      success: false,
      message: 'Too many payment requests, please try again later'
    });
  }
});

/**
 * Authentication Rate Limiter
 * - 20 requests per minute per IP
 * - For registration, password reset, 2FA endpoints
 */
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // Limit each IP to 20 requests per minute
  message: 'Too many authentication attempts from this IP.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test',
  handler: (req, res) => {
    return res.status(429).json({
      success: false,
      message: 'Too many requests, please try again later'
    });
  }
});

/**
 * Bid Rate Limiter
 * - 30 requests per minute per IP
 * - Prevents bid spam and auction manipulation
 */
const bidLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: 'Too many bids from this IP.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test',
  handler: (req, res) => {
    return res.status(429).json({
      success: false,
      message: 'Too many bid requests, please try again later'
    });
  }
});

module.exports = {
  loginLimiter,
  apiLimiter,
  paymentLimiter,
  authLimiter,
  bidLimiter
};

/**
 * ============================================================================
 * Express Application Factory
 * Silent Auction Gallery - Main Application Setup
 * ============================================================================
 *
 * Usage:
 *   const createApp = require('./app');
 *   const app = createApp(db);   // production: pass real Database instance
 *   const app = createApp(null); // minimal: auth/user/school routes skipped
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

const { apiLimiter, authLimiter, paymentLimiter, bidLimiter } = require('./middleware/rateLimitMiddleware');
const {
  sanitizeInput,
  idempotencyMiddleware,
  securityLogger,
  encodeHTML
} = require('./middleware/securityMiddleware');

/**
 * Create a fully-configured Express application.
 *
 * @param {Database|null} db - Initialized Database instance. When provided,
 *   auth, user, school, admin and teacher routes are mounted. When null/undefined
 *   those routes are skipped (useful for lightweight test setups).
 * @returns {import('express').Application}
 */
function createApp(db) {
  const app = express();

  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';

  // Trust proxy for reverse proxy / load-balancer headers
  app.set('trust proxy', 1);

  // Slot for WebSocket server reference (set by index.js)
  app.wsServer = null;

  // ==========================================================================
  // SECURITY HEADERS
  // ==========================================================================

  // CSP is enabled in production and test; relaxed in development so local
  // assets are not blocked during active development.
  if (isProduction || isTest) {
    app.use(helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
          imgSrc: ["'self'", 'data:', 'https:'],
          fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
          connectSrc: ["'self'", 'https:', 'wss:', 'ws:'],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: []
        }
      }
    }));
  } else {
    // Development: minimal helmet so assets aren't blocked
    app.use(helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' }
    }));
  }

  // ==========================================================================
  // CORS
  // ==========================================================================
  const corsOptions = {
    origin: isProduction
      ? ['https://yourdomain.com', 'https://www.yourdomain.com']
      : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  };
  app.use(cors(corsOptions));

  // ==========================================================================
  // BODY PARSING & STATIC FILES
  // ==========================================================================
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // ==========================================================================
  // SECURITY MIDDLEWARE
  // Order matters: logger → sanitiser → idempotency → rate limiting
  // ==========================================================================
  app.use(securityLogger);
  app.use(sanitizeInput);
  app.use(idempotencyMiddleware);
  app.use(apiLimiter);

  // Request logging (dev only — skip in test to keep output clean)
  if (!isProduction && !isTest) {
    app.use((req, res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      next();
    });
  }

  // ==========================================================================
  // UTILITY ENDPOINTS
  // ==========================================================================
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  // ==========================================================================
  // API ROUTES — DB-DEPENDENT (auth, user, schools, admin, teacher)
  // ==========================================================================
  if (db) {
    // Authentication routes (register, login, logout, refresh, 2FA)
    const authRoutes = require('./routes/authRoutes')(db);
    app.use('/api/auth', authLimiter);
    app.use('/api/auth', authRoutes);

    // User profile / account routes (all require JWT)
    const authMiddleware = require('./middleware/authMiddleware');
    const userRoutes = require('./routes/userRoutes')(db);
    app.use('/api/user', authMiddleware.verifyToken);
    app.use('/api/user', userRoutes);

    // School lookup (public)
    const schoolRoutes = require('./routes/schoolRoutes')(db);
    app.use('/api/schools', schoolRoutes);

    // Admin routes (SITE_ADMIN / SCHOOL_ADMIN)
    const adminRoutes = require('./routes/adminRoutes');
    app.use('/api/admin', adminRoutes);

    // Teacher routes (TEACHER / SCHOOL_ADMIN / SITE_ADMIN)
    const teacherRoutes = require('./routes/teacherRoutes');
    app.use('/api/teacher', teacherRoutes);
  }

  // ==========================================================================
  // API ROUTES — NO DB REQUIRED (auctions, bidding, payments)
  // These routes manage their own DB access internally.
  // ==========================================================================
  const auctionRoutes = require('./routes/auctionRoutes');
  app.use('/api/auctions', apiLimiter);
  app.use('/api/auctions', auctionRoutes);

  const paymentRoutes = require('./routes/paymentRoutes');
  app.use('/api/payments', paymentLimiter);
  app.use('/api/payments', paymentRoutes);

  const biddingRoutes = require('./routes/biddingRoutes');
  app.use('/api/bidding', bidLimiter);
  app.use('/api/bidding', biddingRoutes);

  // ==========================================================================
  // PUBLIC CONFIG (no auth required — only non-secret values)
  // ==========================================================================
  app.get('/api/config/stripe-key', (req, res) => {
    res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '' });
  });

  // ==========================================================================
  // ERROR HANDLING (must be last)
  // ==========================================================================

  // 404 — no route matched
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.path} not found`,
      timestamp: new Date().toISOString()
    });
  });

  // Global error handler
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    if (!isTest) {
      console.error('Global Error Handler:', {
        message: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString()
      });
    }

    const statusCode = err.statusCode || err.status || 500;
    let message = err.message || 'Internal Server Error';
    message = encodeHTML(message);

    res.status(statusCode).json({
      error: err.name || 'Error',
      message,
      ...(isProduction ? {} : { stack: err.stack }),
      timestamp: new Date().toISOString()
    });
  });

  return app;
}

module.exports = createApp;

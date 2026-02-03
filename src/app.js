/**
 * ============================================================================
 * Express Application Configuration
 * Silent Auction Gallery - Main Application Setup
 * ============================================================================
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

/**
 * Import Middleware
 */
const { loginLimiter, apiLimiter, paymentLimiter, authLimiter, bidLimiter } = require('./middleware/rateLimitMiddleware');
const {
  sanitizeInput,
  authLimiter: securityAuthLimiter,
  paymentLimiter: securityPaymentLimiter,
  idempotencyMiddleware,
  securityLogger
} = require('./middleware/securityMiddleware');

/**
 * Import Routes
 */
// authRoutes will be mounted dynamically in index.js after db initialization
const auctionRoutes = require('./routes/auctionRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const biddingRoutes = require('./routes/biddingRoutes');

/**
 * Create Express Application
 */
const app = express();

// Store for WebSocket server (will be set by index.js)
app.wsServer = null;

/**
 * ============================================================================
 * MIDDLEWARE SETUP
 * ============================================================================
 */

/**
 * Security Headers (Helmet.js)
 * - Sets X-Frame-Options, X-Content-Type-Options, etc.
 * - Provides protection against common vulnerabilities
 * - Allow CSS, images, and fonts to load properly
 * - Disable CSP in development for easier debugging
 */
if (process.env.NODE_ENV === 'production') {
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'https:', 'wss:', 'ws:'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: []
      }
    }
  }));
} else {
  // Development: use minimal helmet config to avoid blocking assets
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  }));
}

/**
 * CORS Configuration
 * - Allow requests from specified origins
 * - Development: Allow all origins
 * - Production: Restrict to specific domains
 */
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? ['https://yourdomain.com', 'https://www.yourdomain.com']
    : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};
app.use(cors(corsOptions));

/**
 * Body Parser Middleware
 * - Parse application/json request bodies
 * - Limit payload size to 10MB
 */
/**
 * Static Files Serving
 * - Serve public directory (HTML, CSS, JS)
 * - Use absolute path to ensure it works from any directory
 */
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

/**
 * Security Middleware (Applied to all requests)
 * Order matters: logger → sanitizer → idempotency → rate limiting
 */
app.use(securityLogger); // Log suspicious patterns
app.use(sanitizeInput); // Sanitize all input
app.use(idempotencyMiddleware); // Handle idempotency for payments
app.use(apiLimiter); // General rate limiting

/**
 * Request Logging Middleware (Development Only)
 */
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

/**
 * ============================================================================
 * HEALTH CHECK ENDPOINT
 * ============================================================================
 */

/**
 * Health check endpoint for monitoring and load balancers
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * Root route - serve index.html
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

/**
 * ============================================================================
 * API ROUTES
 * ============================================================================
 */

/**
 * Authentication Routes
 * POST   /api/auth/register      - User registration
 * POST   /api/auth/login         - User login
 * POST   /api/auth/logout        - User logout
 * POST   /api/auth/refresh       - Refresh access token
 * POST   /api/auth/2fa/setup     - Setup 2FA
 * POST   /api/auth/2fa/verify    - Verify 2FA code
 * Rate limit: 20 requests/min for general auth, 5/min for login
 * NOTE: Mounted dynamically in index.js after database initialization
 */

/**
 * Auction Routes
 * GET    /api/auctions           - List auctions
 * GET    /api/auctions/:id       - Get auction details
 * POST   /api/auctions           - Create auction (admin only)
 * PUT    /api/auctions/:id       - Update auction (admin only)
 * DELETE /api/auctions/:id       - Delete auction (admin only)
 * POST   /api/auctions/:id/bids  - Place bid
 * Rate limit: 100 requests/min
 */
app.use('/api/auctions', apiLimiter);
app.use('/api/auctions', auctionRoutes);

/**
 * Payment Routes
 * POST   /api/payments           - Process payment
 * GET    /api/payments/:id       - Get payment details
 * POST   /api/payments/:id/refund - Refund payment
 * POST   /api/webhooks/stripe    - Stripe webhook handler
 * POST   /api/webhooks/square    - Square webhook handler
 * Rate limit: 10 requests/min (strict for payment security)
 */
app.use('/api/payments', paymentLimiter);
app.use('/api/payments', paymentRoutes);

/**
 * Bidding Routes
 * POST   /api/bidding/place      - Place a bid
 * POST   /api/bidding/withdraw   - Withdraw a bid
 * GET    /api/bidding/artwork/:id/history - Get bid history
 * GET    /api/bidding/artwork/:id/state - Get bidding state
 * GET    /api/bidding/user/history - Get user's bid history
 * GET    /api/bidding/user/active - Get user's active auctions
 * GET    /api/bidding/auction/:id/winner - Get auction winner
 * POST   /api/bidding/auction/:id/close - Close auction (admin)
 * GET    /api/bidding/stats      - Get real-time stats (admin)
 * Rate limit: 30 requests/min (to prevent bid spam)
 */
app.use('/api/bidding', bidLimiter);
app.use('/api/bidding', biddingRoutes);

/**
 * ============================================================================
 * EXPORT APPLICATION
 * ============================================================================
 */

module.exports = app;


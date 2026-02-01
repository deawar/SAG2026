/**
 * ============================================================================
 * Express Application Configuration
 * Silent Auction Gallery - Main Application Setup
 * ============================================================================
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

/**
 * Import Middleware
 */
const { loginLimiter, apiLimiter, paymentLimiter, authLimiter, bidLimiter } = require('./middleware/rateLimitMiddleware');

/**
 * Import Routes
 */
const authRoutes = require('./routes/authRoutes');
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
 */
app.use(helmet());

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
 */
app.use(express.static('public'));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

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
 */
app.use('/api/auth', authLimiter);
app.use('/api/auth', authRoutes);

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
 * ERROR HANDLING & 404
 * ============================================================================
 */

/**
 * 404 Not Found Handler
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString()
  });
});

/**
 * Global Error Handler
 * - Catches all errors from routes and middleware
 * - Formats error responses consistently
 * - Logs errors for debugging
 */
app.use((err, req, res, next) => {
  console.error('Global Error Handler:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Determine status code
  const statusCode = err.statusCode || err.status || 500;

  // Determine error message
  const message = process.env.NODE_ENV === 'production'
    ? (statusCode === 500 ? 'Internal Server Error' : err.message)
    : err.message;

  // Send error response
  res.status(statusCode).json({
    error: err.name || 'Error',
    message: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    timestamp: new Date().toISOString()
  });
});

/**
 * ============================================================================
 * EXPORT APPLICATION
 * ============================================================================
 */

module.exports = app;


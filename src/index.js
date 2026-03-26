/**
 * ============================================================================
 * Express Server Entry Point
 * Silent Auction Gallery - Main Application Server
 * ============================================================================
 */

require('dotenv').config();
const http = require('http');
const https = require('https');
const fs = require('fs');
const app = require('./app');
const { Database } = require('./models');
const realtimeService = require('./services/realtimeService');
const { encodeHTML } = require('./middleware/securityMiddleware');

/**
 * Configuration
 */
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const HTTPS_ENABLED = process.env.HTTPS_ENABLED === 'true';
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || './ssl/key.pem';
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || './ssl/cert.pem';

// Store database instance for route initialization
let db = null;

/**
 * ============================================================================
 * START SERVER
 * ============================================================================
 */

/**
 * Initialize database connection and start server
 */
async function startServer() {
  try {
    console.log('============================================================');
    console.log('Silent Auction Gallery - Server Starting');
    console.log('============================================================');
    console.log(`Environment: ${NODE_ENV}`);
    console.log(`Port: ${PORT}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);

    /**
     * Test Database Connection
     */
    console.log('\nTesting database connection...');
    try {
      const dbConfig = {
        user: process.env.DB_USER || process.env.DATABASE_USER,
        password: process.env.DB_PASSWORD || process.env.DATABASE_PASSWORD,
        host: process.env.DB_HOST || process.env.DATABASE_HOST,
        port: process.env.DB_PORT || process.env.DATABASE_PORT,
        database: process.env.DB_NAME || process.env.DATABASE_NAME,
        maxConnections: process.env.DB_POOL_MAX || 10
      };

      // Check if all required DB config values are present
      if (!dbConfig.user || !dbConfig.password || !dbConfig.host) {
        throw new Error('Missing database configuration in .env file');
      }

      db = new Database(dbConfig);
      await db.query('SELECT NOW() as current_time');
      console.log('✅ Database connection successful');
    } catch (dbError) {
      console.warn('⚠️  Database not available (continuing anyway for development)');
      console.warn(`   Error: ${dbError.message}`);
    }

    /**
     * Run lightweight startup migrations (idempotent — safe to run every boot).
     * Adds columns/indexes that may be missing on existing deployments.
     */
    if (db) {
      console.log('\nRunning startup migrations...');
      try {
        // pg_trgm must be created before the GIN indexes that depend on it
        await db.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
        await db.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS ceeb_code VARCHAR(10)`);
        await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_schools_ceeb
                        ON schools (ceeb_code) WHERE ceeb_code IS NOT NULL`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_schools_name_trgm
                        ON schools USING GIN (name gin_trgm_ops)`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_schools_city_trgm
                        ON schools USING GIN (city gin_trgm_ops)`);
        // Replace column-level UNIQUE on email with a partial index so soft-deleted
        // users don't block re-registration with the same email address.
        await db.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key`);
        await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_active
                        ON users(email) WHERE deleted_at IS NULL`);
        // Watchlist table for auction-detail page
        await db.query(`
          CREATE TABLE IF NOT EXISTS auction_watchlist (
            user_id    UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
            auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, auction_id)
          )`);
        // Widen image_url to TEXT so base64 data URLs can be stored directly
        // (avoids filesystem permission issues in containerised deployments)
        await db.query(`ALTER TABLE artwork ALTER COLUMN image_url TYPE TEXT`);
        console.log('✅ Startup migrations complete');
      } catch (migErr) {
        console.warn('⚠️  Startup migration warning:', migErr.message);
      }
    }

    /**
     * Mount Authentication Routes (requires database)
     */
    if (db) {
      console.log('\nMounting authentication routes...');
      try {
        const authRoutes = require('./routes/authRoutes')(db);
        const { authLimiter } = require('./middleware/rateLimitMiddleware');
        app.use('/api/auth', authLimiter);
        app.use('/api/auth', authRoutes);
        console.log('✅ Authentication routes mounted');
      } catch (routeErr) {
        console.error('❌ ERROR mounting auth routes:', routeErr);
      }

      /**
       * Mount User Routes (requires authentication)
       */
      console.log('Mounting user routes...');
      try {
        const userRoutes = require('./routes/userRoutes')(db);
        const authMiddleware = require('./middleware/authMiddleware');
        app.use('/api/user', authMiddleware.verifyToken);
        app.use('/api/user', userRoutes);
        console.log('✅ User routes mounted');
      } catch (routeErr) {
        console.error('❌ ERROR mounting user routes:', routeErr);
      }

      /**
       * Mount School Routes (public, no auth required)
       */
      console.log('Mounting school routes...');
      try {
        const schoolRoutes = require('./routes/schoolRoutes')(db);
        app.use('/api/schools', schoolRoutes);
        console.log('✅ School routes mounted');
      } catch (routeErr) {
        console.error('❌ ERROR mounting school routes:', routeErr);
      }

      /**
       * Mount Admin Routes (requires SITE_ADMIN or SCHOOL_ADMIN role)
       */
      console.log('Mounting admin routes...');
      try {
        const adminRoutes = require('./routes/adminRoutes');
        app.use('/api/admin', adminRoutes);
        console.log('✅ Admin routes mounted');
      } catch (routeErr) {
        console.error('❌ ERROR mounting admin routes:', routeErr);
      }

      /**
       * Mount Teacher Routes (requires TEACHER, SCHOOL_ADMIN, or SITE_ADMIN role)
       */
      console.log('Mounting teacher routes...');
      try {
        const teacherRoutes = require('./routes/teacherRoutes');
        app.use('/api/teacher', teacherRoutes);
        console.log('✅ Teacher routes mounted');
      } catch (routeErr) {
        console.error('❌ ERROR mounting teacher routes:', routeErr);
      }

      /**
       * Mount Auction Routes (public list + authenticated CRUD)
       */
      console.log('Mounting auction routes...');
      try {
        const auctionRoutes = require('./routes/auctionRoutes');
        const { apiLimiter } = require('./middleware/rateLimitMiddleware');
        app.use('/api/auctions', apiLimiter);
        app.use('/api/auctions', auctionRoutes);
        console.log('✅ Auction routes mounted');
      } catch (routeErr) {
        console.error('❌ ERROR mounting auction routes:', routeErr);
      }

      /**
       * Mount Bidding Routes (authenticated bidding operations + WebSocket broadcast)
       */
      console.log('Mounting bidding routes...');
      try {
        const biddingRoutes = require('./routes/biddingRoutes');
        const { bidLimiter } = require('./middleware/rateLimitMiddleware');
        app.use('/api/bidding', bidLimiter);
        app.use('/api/bidding', biddingRoutes);
        console.log('✅ Bidding routes mounted');
      } catch (routeErr) {
        console.error('❌ ERROR mounting bidding routes:', routeErr);
      }

      /**
       * Mount Payment Routes (authenticated payment processing + webhook receiver)
       */
      console.log('Mounting payment routes...');
      try {
        const paymentRoutes = require('./routes/paymentRoutes');
        const { paymentLimiter } = require('./middleware/rateLimitMiddleware');
        app.use('/api/payments', paymentLimiter);
        app.use('/api/payments', paymentRoutes);
        console.log('✅ Payment routes mounted');
      } catch (routeErr) {
        console.error('❌ ERROR mounting payment routes:', routeErr);
      }
    } else {
      console.warn('⚠️  Skipping auth routes (database unavailable)');
    }

    /**
     * ============================================================================
     * ERROR HANDLING & 404 HANDLERS (MUST BE LAST!)
     * ============================================================================
     */

    /**
     * 404 Not Found Handler
     * Must come before error handler
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
     * Catches all errors from routes and middleware
     * Encodes error messages to prevent XSS
     */
    app.use((err, req, res, next) => {
      console.error('Global Error Handler:', {
        message: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString()
      });

      const statusCode = err.statusCode || err.status || 500;
      let message = err.message || 'Internal Server Error';

      // Encode HTML in error message to prevent XSS
      message = encodeHTML(message);

      res.status(statusCode).json({
        error: err.name || 'Error',
        message: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
        timestamp: new Date().toISOString()
      });
    });

    /**
     * Create HTTP/HTTPS Server with WebSocket Support
     */
    let server;
    if (HTTPS_ENABLED) {
      try {
        const sslOptions = {
          key: fs.readFileSync(SSL_KEY_PATH),
          cert: fs.readFileSync(SSL_CERT_PATH)
        };
        server = https.createServer(sslOptions, app);
        console.log('✅ HTTPS enabled');
      } catch (err) {
        console.warn('⚠️  HTTPS configured but certificates not found, falling back to HTTP');
        console.warn(`   Expected: ${SSL_KEY_PATH} and ${SSL_CERT_PATH}`);
        server = http.createServer(app);
      }
    } else {
      server = http.createServer(app);
    }

    /**
     * Initialize WebSocket Server
     */
    console.log('\nInitializing WebSocket server...');
    realtimeService.initializeWebSocketServer(server);
    const wsInitProtocol = HTTPS_ENABLED ? 'wss' : 'ws';
    console.log(`✅ WebSocket server initialized at ${wsInitProtocol}://localhost:${PORT}`);

    /**
     * Start HTTP/HTTPS Server
     */
    // Bind to all interfaces so healthchecks and proxies can reach the server
    const bindAddress = '0.0.0.0';

    server.listen(PORT, bindAddress, () => {
      const os = require('os');
      const interfaces = os.networkInterfaces();
      let localIp = 'localhost';
      
      // Find the local IP address
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            localIp = iface.address;
            break;
          }
        }
        if (localIp !== 'localhost') break;
      }

      const protocol = HTTPS_ENABLED ? 'https' : 'http';
      const wsProtocol = HTTPS_ENABLED ? 'wss' : 'ws';

      console.log('\n============================================================');
      console.log(`✅ Server running on ${protocol}://${localIp}:${PORT}`);
      console.log(`   Local machine:   ${protocol}://localhost:${PORT}`);
      console.log(`   Network access:  ${protocol}://${localIp}:${PORT}`);
      console.log(`   Bound to:        ${bindAddress}`);
      console.log('============================================================\n');
      console.log('Endpoints available:');
      console.log(`  Health Check:     GET ${protocol}://localhost:${PORT}/health`);
      console.log(`  Auth API:         ${protocol}://localhost:${PORT}/api/auth`);
      console.log(`  User API:         ${protocol}://localhost:${PORT}/api/user (requires auth)`);
      console.log(`  Auction API:      ${protocol}://localhost:${PORT}/api/auctions`);
      console.log(`  Payment API:      ${protocol}://localhost:${PORT}/api/payments`);
      console.log(`  Bidding API:      ${protocol}://localhost:${PORT}/api/bidding`);
      console.log(`  WebSocket:        ${wsProtocol}://localhost:${PORT}/ws`);
      console.log('\n');
    });

    /**
     * Graceful Shutdown Handlers
     */
    const gracefulShutdown = (signal) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      
      // Close WebSocket connections
      realtimeService.shutdown();
      
      // Close HTTP server
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
      
      // Force shutdown after 10 seconds
      setTimeout(() => {
        console.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    /**
     * Uncaught Exception Handler
     */
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      process.exit(1);
    });

    /**
     * Unhandled Promise Rejection Handler
     */
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

/**
 * Start the server
 */
startServer();

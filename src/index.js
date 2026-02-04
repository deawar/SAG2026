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
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
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
      let message = process.env.NODE_ENV === 'production'
        ? (statusCode === 500 ? 'Internal Server Error' : err.message)
        : err.message;

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
    // Determine binding address
    let bindAddress = '0.0.0.0'; // Try all interfaces
    const os = require('os');
    const interfaces = os.networkInterfaces();
    
    // Try to find actual network IP for binding on Windows
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          // Bind to actual IP on Windows for better network access
          bindAddress = iface.address;
          break;
        }
      }
      if (bindAddress !== '0.0.0.0') break;
    }

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

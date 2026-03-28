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
const createApp = require('./app');
const { Database } = require('./models');
const realtimeService = require('./services/realtimeService');

/**
 * Configuration
 */
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const HTTPS_ENABLED = process.env.HTTPS_ENABLED === 'true';
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || './ssl/key.pem';
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || './ssl/cert.pem';

/**
 * ============================================================================
 * START SERVER
 * ============================================================================
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
    let db = null;
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
        await db.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
        await db.query('ALTER TABLE schools ADD COLUMN IF NOT EXISTS ceeb_code VARCHAR(10)');
        await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_schools_ceeb
                        ON schools (ceeb_code) WHERE ceeb_code IS NOT NULL`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_schools_name_trgm
                        ON schools USING GIN (name gin_trgm_ops)`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_schools_city_trgm
                        ON schools USING GIN (city gin_trgm_ops)`);
        // Replace column-level UNIQUE on email with a partial index so soft-deleted
        // users don't block re-registration with the same email address.
        await db.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key');
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
        await db.query('ALTER TABLE artwork ALTER COLUMN image_url TYPE TEXT');
        // JTI blacklist for token revocation on logout
        await db.query(`
          CREATE TABLE IF NOT EXISTS token_blacklist (
            jti        TEXT        NOT NULL PRIMARY KEY,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
          )`);
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires
            ON token_blacklist (expires_at)`);
        console.log('✅ Startup migrations complete');
      } catch (migErr) {
        console.warn('⚠️  Startup migration warning:', migErr.message);
      }
    } else {
      console.warn('⚠️  Skipping auth/user routes (database unavailable)');
    }

    /**
     * Build fully-configured Express application.
     * All route mounting (auth, user, schools, admin, teacher, auctions,
     * bidding, payments) and error handlers are set up inside createApp().
     */
    const app = createApp(db);

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
    const bindAddress = '0.0.0.0';

    server.listen(PORT, bindAddress, () => {
      const os = require('os');
      const interfaces = os.networkInterfaces();
      let localIp = 'localhost';

      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            localIp = iface.address;
            break;
          }
        }
        if (localIp !== 'localhost') { break; }
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
      realtimeService.shutdown();
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
      setTimeout(() => {
        console.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();

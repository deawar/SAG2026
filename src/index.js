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
        // Widen users.account_status CHECK to every state the app uses. The
        // registration flow inserts PENDING (students, pre-verification) and
        // PENDING_APPROVAL (teachers, pre-admin-approval); an older live DB was
        // created before those were permitted, so the insert hit a 23514 check
        // violation → 500. Rebuild the constraint idempotently so existing
        // deployments converge on redeploy.
        await db.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_status_check');
        await db.query(`ALTER TABLE users ADD CONSTRAINT users_account_status_check
                        CHECK (account_status IN ('ACTIVE','SUSPENDED','LOCKED','INACTIVE','PENDING','PENDING_APPROVAL','PENDING_VERIFICATION'))`);
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

      // Student Portfolio feature schema (idempotent — safe every boot).
      // Isolated from the block above so a trigger hiccup can't skip the
      // essential table/column/indexes. Mirrors
      // db/migrations/20260704000000_add_portfolio_items.up.sql.
      try {
        await db.query(`
          CREATE TABLE IF NOT EXISTS portfolio_items (
            id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            student_user_id      UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
            school_id            UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            title                VARCHAR(255) NOT NULL,
            description          TEXT,
            medium               VARCHAR(100),
            artist_grade         VARCHAR(20),
            dimensions_width_cm  DECIMAL(10, 2),
            dimensions_height_cm DECIMAL(10, 2),
            dimensions_depth_cm  DECIMAL(10, 2),
            estimated_value      DECIMAL(10, 2),
            image_url            TEXT,
            image_storage_key    VARCHAR(500),
            portfolio_status     VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS'
                                 CHECK (portfolio_status IN ('IN_PROGRESS', 'COMPLETED')),
            submission_state     VARCHAR(20) NOT NULL DEFAULT 'NOT_SUBMITTED'
                                 CHECK (submission_state IN ('NOT_SUBMITTED','PENDING_REVIEW','IN_AUCTION','SOLD','UNSOLD','REJECTED','WITHDRAWN')),
            rejection_reason     TEXT,
            created_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            deleted_at           TIMESTAMP WITH TIME ZONE,
            CONSTRAINT portfolio_title_check CHECK (length(trim(title)) > 0)
          )`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_portfolio_items_student
                        ON portfolio_items(student_user_id) WHERE deleted_at IS NULL`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_portfolio_items_school
                        ON portfolio_items(school_id) WHERE deleted_at IS NULL`);
        await db.query(`ALTER TABLE artwork ADD COLUMN IF NOT EXISTS portfolio_item_id
                        UUID NULL REFERENCES portfolio_items(id) ON DELETE SET NULL`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_artwork_portfolio_item
                        ON artwork(portfolio_item_id)`);
        // Widen image_url to TEXT for existing tables: base64 data URLs far
        // exceed VARCHAR(2083) and overflow (500 on save). Mirrors the artwork
        // widening above. Idempotent — TEXT -> TEXT is a no-op.
        await db.query('ALTER TABLE portfolio_items ALTER COLUMN image_url TYPE TEXT');
        // Non-essential convenience trigger (kept last so a failure here does
        // not block the table/column above). update_updated_at_column() ships
        // with the baseline schema.
        await db.query('DROP TRIGGER IF EXISTS portfolio_items_updated_at ON portfolio_items');
        await db.query(`CREATE TRIGGER portfolio_items_updated_at BEFORE UPDATE ON portfolio_items
                        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);

        // Moderation fields on portfolio_items
        await db.query(`ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(20) NOT NULL DEFAULT 'VISIBLE'
          CHECK (moderation_status IN ('VISIBLE','REMOVED'))`);
        await db.query('ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS moderated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL');
        await db.query('ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMP WITH TIME ZONE');
        await db.query('ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS moderation_reason TEXT');

        // Per-piece comment thread
        await db.query(`CREATE TABLE IF NOT EXISTS portfolio_comments (
          id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          portfolio_item_id  UUID NOT NULL REFERENCES portfolio_items(id) ON DELETE CASCADE,
          school_id          UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
          author_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
          author_role        VARCHAR(20) NOT NULL,
          body               TEXT NOT NULL,
          parent_comment_id  UUID REFERENCES portfolio_comments(id) ON DELETE CASCADE,
          created_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          deleted_at         TIMESTAMP WITH TIME ZONE,
          deleted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          CONSTRAINT portfolio_comment_body_check CHECK (length(trim(body)) BETWEEN 1 AND 2000)
        )`);
        await db.query('CREATE INDEX IF NOT EXISTS idx_portfolio_comments_item   ON portfolio_comments(portfolio_item_id) WHERE deleted_at IS NULL');
        await db.query('CREATE INDEX IF NOT EXISTS idx_portfolio_comments_school ON portfolio_comments(school_id)');
        await db.query('DROP TRIGGER IF EXISTS portfolio_comments_updated_at ON portfolio_comments');
        await db.query(`CREATE TRIGGER portfolio_comments_updated_at BEFORE UPDATE ON portfolio_comments
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);

        // Per-user unread tracking
        await db.query(`CREATE TABLE IF NOT EXISTS portfolio_comment_reads (
          user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          portfolio_item_id UUID NOT NULL REFERENCES portfolio_items(id) ON DELETE CASCADE,
          last_read_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, portfolio_item_id)
        )`);

        console.log('✅ Portfolio schema ready');
      } catch (pfErr) {
        console.warn('⚠️  Portfolio schema warning:', pfErr.message);
      }

      // School Gallery feature schema (idempotent — safe every boot).
      // Adds grade_band to schools, grade_level to users, opt-in flags to
      // portfolio_items, and the gallery_roster join table (Task 1).
      try {
        await db.query('ALTER TABLE schools ADD COLUMN IF NOT EXISTS grade_band VARCHAR(20)');
        await db.query('ALTER TABLE schools DROP CONSTRAINT IF EXISTS schools_grade_band_check');
        await db.query(`ALTER TABLE schools ADD CONSTRAINT schools_grade_band_check
          CHECK (grade_band IS NULL OR grade_band IN ('ELEMENTARY','MIDDLE','HIGH'))`);
        await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS grade_level VARCHAR(20)');
        await db.query('ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS shared_to_gallery BOOLEAN NOT NULL DEFAULT false');
        await db.query('ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS gallery_comments_allowed BOOLEAN NOT NULL DEFAULT false');
        await db.query(`CREATE TABLE IF NOT EXISTS gallery_roster (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
          student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          added_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (school_id, student_user_id))`);
        await db.query('CREATE INDEX IF NOT EXISTS idx_gallery_roster_school ON gallery_roster(school_id)');
        console.log('✅ Gallery schema ready');
      } catch (galErr) {
        console.warn('⚠️  Gallery schema warning:', galErr.message);
      }

      // Cross-school grant tables (Plan B — idempotent, safe every boot).
      try {
        await db.query(`CREATE TABLE IF NOT EXISTS gallery_grants (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          host_school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
          host_band VARCHAR(20) NOT NULL,
          invited_email CITEXT NOT NULL,
          invited_school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
          invited_teacher_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','DECLINED','REVOKED')),
          invite_token_hash VARCHAR(64) NOT NULL,
          token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          accepted_at TIMESTAMP WITH TIME ZONE,
          revoked_at TIMESTAMP WITH TIME ZONE,
          revoked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL)`);
        await db.query('CREATE INDEX IF NOT EXISTS idx_gallery_grants_host ON gallery_grants(host_school_id, status)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_gallery_grants_invited_teacher ON gallery_grants(invited_teacher_user_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_gallery_grants_token ON gallery_grants(invite_token_hash) WHERE status = \'PENDING\'');
        await db.query(`CREATE TABLE IF NOT EXISTS gallery_grant_members (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          grant_id UUID NOT NULL REFERENCES gallery_grants(id) ON DELETE CASCADE,
          student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          enabled_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (grant_id, student_user_id))`);
        await db.query('CREATE INDEX IF NOT EXISTS idx_gallery_grant_members_student ON gallery_grant_members(student_user_id)');
        console.log('✅ Gallery grants schema ready');
      } catch (grantErr) {
        console.warn('⚠️  Gallery grants schema warning:', grantErr.message);
      }

      // Gallery comments (Plan C — idempotent, safe every boot).
      try {
        await db.query(`CREATE TABLE IF NOT EXISTS gallery_comments (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          portfolio_item_id UUID NOT NULL REFERENCES portfolio_items(id) ON DELETE CASCADE,
          author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          author_school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
          body TEXT NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
          moderated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          moderated_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT gallery_comment_body_check CHECK (length(trim(body)) > 0))`);
        await db.query('CREATE INDEX IF NOT EXISTS idx_gallery_comments_item_status ON gallery_comments(portfolio_item_id, status)');
        console.log('✅ Gallery comments schema ready');
      } catch (gcErr) {
        console.warn('⚠️  Gallery comments schema warning:', gcErr.message);
      }

      // Scheduled auction transitions (auto-start / auto-end). Not in tests.
      if (process.env.NODE_ENV !== 'test') {
        const auctionScheduler = require('./services/auctionScheduler');
        auctionScheduler.start();
        console.log('✅ Auction scheduler running (60s sweep)');
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

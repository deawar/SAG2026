/**
 * ============================================================================
 * Express Server Entry Point
 * Silent Auction Gallery - Main Application Server
 * ============================================================================
 */

require('dotenv').config();
const http = require('http');
const app = require('./app');
const { Database } = require('./models');
const realtimeService = require('./services/realtimeService');

/**
 * Configuration
 */
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

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

      const db = new Database(dbConfig);
      await db.query('SELECT NOW() as current_time');
      console.log('✅ Database connection successful');
    } catch (dbError) {
      console.warn('⚠️  Database not available (continuing anyway for development)');
      console.warn(`   Error: ${dbError.message}`);
    }

    /**
     * Create HTTP Server with WebSocket Support
     */
    const server = http.createServer(app);

    /**
     * Initialize WebSocket Server
     */
    console.log('\nInitializing WebSocket server...');
    realtimeService.initializeWebSocketServer(server);
    console.log('✅ WebSocket server initialized at ws://localhost:' + PORT);

    /**
     * Start HTTP Server
     */
    server.listen(PORT, () => {
      console.log('\n============================================================');
      console.log(`✅ Server running on http://localhost:${PORT}`);
      console.log('============================================================\n');
      console.log('Endpoints available:');
      console.log(`  Health Check:     GET http://localhost:${PORT}/health`);
      console.log(`  Auth API:         http://localhost:${PORT}/api/auth`);
      console.log(`  Auction API:      http://localhost:${PORT}/api/auctions`);
      console.log(`  Payment API:      http://localhost:${PORT}/api/payments`);
      console.log(`  Bidding API:      http://localhost:${PORT}/api/bidding`);
      console.log(`  WebSocket:        ws://localhost:${PORT}/ws`);
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

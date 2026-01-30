/**
 * ============================================================================
 * Jest Configuration
 * Silent Auction Gallery - Test Runner Setup
 * ============================================================================
 */

module.exports = {
  /**
   * Test Environment
   * Use Node.js environment for backend testing
   */
  testEnvironment: 'node',

  /**
   * Test Match Patterns
   * Find all test files with .test.js or .spec.js extensions
   */
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],

  /**
   * Module Name Mapper
   * Map aliases to actual file paths for easier imports
   */
  moduleNameMapper: {
    '^@models/(.*)$': '<rootDir>/src/models/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@controllers/(.*)$': '<rootDir>/src/controllers/$1',
    '^@routes/(.*)$': '<rootDir>/src/routes/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  /**
   * Module Directories
   * Tell Jest where to find node modules
   */
  moduleDirectories: ['node_modules', 'src'],

  /**
   * Coverage Configuration
   * Configure code coverage reporting
   */
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/app.js',
    '!**/node_modules/**',
  ],

  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },

  /**
   * Test Timeout
   * Set timeout for tests (in milliseconds)
   */
  testTimeout: 10000,

  /**
   * Verbose Output
   * Show detailed test output
   */
  verbose: true,

  /**
   * Clear Mocks Between Tests
   * Reset mocks after each test
   */
  clearMocks: true,

  /**
   * Restore Mocks Between Tests
   */
  restoreMocks: true,

  /**
   * Transform Files
   * No transformation needed for plain JavaScript
   */
  transform: {},

  /**
   * Transform Ignore Patterns
   * Standard pattern (uuid not needed since using built-in randomUUID)
   */
  transformIgnorePatterns: [
    'node_modules/(?!.*)'
  ],

  /**
   * Bail on First Error
   * Stop running tests after first failure (useful for debugging)
   */
  bail: false,
};

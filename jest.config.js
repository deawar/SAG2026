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
   * Test Path Ignore Patterns
   * Exclude node_modules and .claude agent worktrees
   */
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.claude/',
  ],

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
   * Use babel-jest so jest.mock() is hoisted above require() calls
   */
  transform: {
    '^.+\\.js$': 'babel-jest',
  },

  /**
   * Transform Ignore Patterns
   * Do not transform node_modules
   */
  transformIgnorePatterns: [
    '/node_modules/',
  ],

  /**
   * Bail on First Error
   * Stop running tests after first failure (useful for debugging)
   */
  bail: false,

  /**
   * Force Exit
   * Terminate worker processes after all tests complete.
   * Prevents open pg.Pool handles (from services that manage their own DB
   * connections) from keeping Jest alive indefinitely.
   */
  forceExit: true,
};

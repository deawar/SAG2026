const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  // ── Global ignores ───────────────────────────────────────────────────────
  {
    ignores: [
      'node_modules/**',
      'public/vendor/**',
      '.claude/**',
      'coverage/**',
      '*.min.js',
      // Root-level config files (this file, babel.config.js, etc.)
      '*.js'
    ]
  },

  // ── Base recommended rules (all files) ───────────────────────────────────
  js.configs.recommended,

  // ── Shared style & quality rules (all JS in src/ and public/) ───────────
  {
    files: ['src/**/*.js', 'public/js/**/*.js', 'tests/**/*.js'],
    rules: {
      // ── Formatting ──────────────────────────────────────────────────────
      'indent':                  ['error', 2, { SwitchCase: 1, flatTernaryExpressions: false }],
      'quotes':                  ['error', 'single', { avoidEscape: true, allowTemplateLiterals: false }],
      'semi':                    ['error', 'always'],
      'comma-dangle':            ['error', 'never'],
      'eol-last':                ['error', 'always'],
      'no-trailing-spaces':      'error',
      'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 0, maxBOF: 0 }],
      'padded-blocks':           ['error', 'never'],
      'lines-between-class-members': ['error', 'always', { exceptAfterSingleLine: true }],

      // ── Spacing ─────────────────────────────────────────────────────────
      'space-before-blocks':        'error',
      'keyword-spacing':            ['error', { before: true, after: true }],
      'space-infix-ops':            'error',
      'space-before-function-paren': ['error', { anonymous: 'never', named: 'never', asyncArrow: 'always' }],
      'arrow-spacing':              ['error', { before: true, after: true }],
      'object-curly-spacing':       ['error', 'always'],
      'array-bracket-spacing':      ['error', 'never'],
      'computed-property-spacing':  ['error', 'never'],
      'key-spacing':                ['error', { beforeColon: false, afterColon: true }],
      'comma-spacing':              ['error', { before: false, after: true }],
      'semi-spacing':               ['error', { before: false, after: true }],
      'space-in-parens':            ['error', 'never'],
      'func-call-spacing':          ['error', 'never'],
      'template-curly-spacing':     ['error', 'never'],

      // ── Variables & declarations ─────────────────────────────────────────
      'no-var':        'error',
      'prefer-const':  ['warn', { destructuring: 'all', ignoreReadBeforeAssign: false }],
      'no-unused-vars': [
        'warn',
        {
          vars: 'all',
          args: 'none',
          caughtErrors: 'none',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_'
        }
      ],
      'no-use-before-define': ['error', { functions: false, classes: true, variables: true }],
      'no-shadow':            ['warn', { builtinGlobals: false, allow: ['err', 'error', 'resolve', 'reject'] }],

      // ── Best practices ───────────────────────────────────────────────────
      'eqeqeq':                   ['error', 'always', { null: 'ignore' }],
      'curly':                    ['error', 'all'],
      'dot-notation':             ['error', { allowKeywords: true }],
      'no-else-return':           ['warn', { allowElseIf: false }],
      'no-useless-return':        'warn',
      'no-throw-literal':         'error',
      'no-return-assign':         'error',
      'no-sequences':             'error',
      'no-unused-expressions':    ['warn', { allowShortCircuit: true, allowTernary: true }],
      'yoda':                     ['error', 'never'],
      'prefer-template':          'warn',
      'object-shorthand':         ['warn', 'always', { avoidQuotes: true }],
      'prefer-arrow-callback':    'warn',
      'no-useless-concat':        'error',
      'no-useless-rename':        'error',
      'no-param-reassign':        ['warn', { props: false }],
      'default-case':             'warn',
      'consistent-return':        'warn',
      'no-lonely-if':             'error',
      'no-unneeded-ternary':      'error',
      'operator-assignment':      ['warn', 'always'],

      // ── Async / Promise ──────────────────────────────────────────────────
      'no-promise-executor-return': 'error',
      'no-return-await':            'warn',
      'no-await-in-loop':           'warn',
      'prefer-promise-reject-errors': 'warn',

      // ── Security ─────────────────────────────────────────────────────────
      'no-eval':         'error',
      'no-implied-eval': 'error',
      'no-new-func':     'error',
      'no-script-url':   'error',

      // ── Logging (warn so incremental cleanup is easy) ────────────────────
      'no-console': 'warn'
    }
  },

  // ── Backend: src/ ─────────────────────────────────────────────────────────
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node
      }
    },
    rules: {
      // console.* is intentional in server startup and error handlers
      'no-console': 'off',
      // Express middleware signatures intentionally include unused `next`
      'no-unused-vars': [
        'warn',
        {
          vars: 'all',
          args: 'none',
          caughtErrors: 'none',
          varsIgnorePattern: '^_'
        }
      ]
    }
  },

  // ── Frontend: public/js/ ──────────────────────────────────────────────────
  {
    files: ['public/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        // CJS compatibility shim used at bottom of some frontend files
        module: 'readonly',
        // Project globals loaded via <script> tags (load order defined in HTML)
        UIComponents: 'readonly',
        ThemeManager: 'readonly',
        AuthManager: 'readonly',
        authManager: 'readonly',
        apiClient: 'readonly',
        WebSocketClient: 'readonly',
        websocketClient: 'readonly',
        // CDN globals
        QRCode: 'readonly',
        Chart: 'readonly'
      }
    },
    rules: {
      // Keep as warn — frontend console usage is being cleaned up incrementally
      'no-console': 'warn',
      // Some older frontend patterns still use var; escalate to error after cleanup
      'no-var': 'warn',
      // Frontend callback patterns make consistent-return hard to enforce globally
      'consistent-return': 'off'
    }
  },

  // ── Frontend definition files (suppress false-positive no-redeclare) ────────
  // These files declare the class/object that is also listed as a project global
  // for consuming files. ESLint sees this as a redeclaration; it is intentional.
  {
    files: [
      'public/js/auth-manager.js',
      'public/js/theme-manager.js',
      'public/js/ui-components.js',
      'public/js/websocket-client.js',
      'public/js/api-client.js'
    ],
    rules: {
      'no-redeclare': 'off',
      // Definition files call use-before-define patterns (e.g. hoisted helpers)
      'no-use-before-define': 'off'
    }
  },

  // ── Test files ────────────────────────────────────────────────────────────
  {
    files: ['tests/**/*.js', '**/*.test.js', '**/*.spec.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    rules: {
      'no-console': 'off',
      // Test files often use var-style patterns for describe/it/expect bindings
      'no-unused-vars': [
        'warn',
        { vars: 'all', args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }
      ]
    }
  }
];

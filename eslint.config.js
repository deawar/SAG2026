const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    js.configs.recommended,
    // Node.js files — backend + db scripts
    {
        files: ['src/**/*.js', 'db/**/*.js'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
        rules: {
            'no-unused-vars': ['error', { vars: 'all', args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
        },
    },
    // Browser frontend files
    {
        files: ['public/js/**/*.js'],
        languageOptions: {
            globals: {
                ...globals.browser,
                // CJS compatibility guard used at bottom of every file
                module: 'readonly',
                // Project globals loaded via script tags
                UIComponents: 'readonly',
                ThemeManager: 'readonly',
                AuthManager: 'readonly',
                authManager: 'readonly',
                apiClient: 'readonly',
                WebSocketClient: 'readonly',
                websocketClient: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': ['error', { vars: 'all', args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
        },
    },
    // Test files
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.jest,
            },
        },
        rules: {
            'no-unused-vars': ['error', { vars: 'all', args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
        },
    },
    {
        ignores: ['node_modules/**', 'public/vendor/**', '.claude/**', '*.js'],
    },
];

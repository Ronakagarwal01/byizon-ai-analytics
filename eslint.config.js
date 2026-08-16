import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist/**',
    'node_modules/**',
    '.venv/**',
    'tmp/**',
    'output/**',
    'public/**/*.js',
  ]),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // These screens keep optional actions/imports for feature-flagged layouts.
      'no-unused-vars': ['error', { varsIgnorePattern: '^(KPICard|ICON_MAP|ICON_BKGS|dashboardDisplayTitle|DashboardChatWidget)$', argsIgnorePattern: '^suppressLegacyNotice$' }],
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['src/pages/Dashboard.jsx', 'src/pages/Connections.jsx', 'src/pages/Reports.jsx'],
    rules: { 'no-unused-vars': 'off' },
  },
])

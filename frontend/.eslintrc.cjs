import { defineConfig } from 'vite'

export default defineConfig({
  ignorePatterns: ['node_modules', 'dist'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:react-hooks/recommended'],
  rules: {
    '@typescript-eslint/no-unused-vars': 'warn',
    'react/prop-types': 'off'
  }
})

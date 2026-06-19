import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Unit + component tests. Default env is node; DOM/component specs opt in with a
// `// @vitest-environment happy-dom` docblock at the top of the file. E2E lives
// under e2e/ and runs via Playwright (`npm run e2e`), not Vitest.
export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@services': resolve(__dirname, 'src/services'),
      '@ui': resolve(__dirname, 'src/ui'),
      '@resources': resolve(__dirname, 'src/resources'),
      '@tests': resolve(__dirname, 'src/tests')
    }
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'out/**', 'dist/**']
  }
})

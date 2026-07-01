import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Unit + component tests. Default env is node; DOM/component specs opt in with a
// `// @vitest-environment happy-dom` docblock at the top of the file. E2E lives
// under e2e/ and runs via Playwright (`npm run e2e`), not Vitest.
export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@configs': resolve(__dirname, 'src/configs'),
      '@models': resolve(__dirname, 'src/models'),
      '@repositories': resolve(__dirname, 'src/repositories'),
      '@texts': resolve(__dirname, 'src/ui-texts/ui-texts.ts'),
      '@services': resolve(__dirname, 'src/services'),
      '@views': resolve(__dirname, 'src/views'),
      '@resources': resolve(__dirname, 'src/resources'),
      '@tests': resolve(__dirname, 'src/tests'),
      '@bridge': resolve(__dirname, 'src/core/bridge')
    }
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/tests/unit/**/*.test.{ts,tsx}'],
    exclude: ['src/tests/e2e/**', 'node_modules/**', 'out/**', 'dist/**']
  }
})

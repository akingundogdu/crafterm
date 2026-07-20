import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import { geaPlugin } from '@geajs/vite-plugin'
import { resolve } from 'path'

// gea's HMR runtime keeps its component registry on `import.meta.hot.data`. Under a dev
// server that object exists; under Vitest `import.meta.hot` is present but has no `.data`,
// so `virtual:gea-hmr` throws on import and every spec that mounts a gea Component dies at
// collection. Vite owns `import.meta.hot`, so `define` cannot rewrite it — neutralise it in
// the virtual module itself. Tests need no HMR.
const disableGeaHmr: Plugin = {
  name: 'gea-hmr-off-in-tests',
  enforce: 'post',
  transform(code, id) {
    if (!id.includes('virtual:gea-hmr')) return null
    return { code: code.replace(/import\.meta\.hot/g, 'undefined'), map: null }
  }
}

// Unit + component tests. Default env is node; DOM/component specs opt in with a
// `// @vitest-environment happy-dom` docblock at the top of the file. E2E lives
// under e2e/ and runs via Playwright (`npm run e2e`), not Vitest.
//
// geaPlugin must be applied here exactly as it is in electron.vite.config.ts: a gea
// Component only renders through its transform, so without it any spec that mounts one
// gets an empty host.
export default defineConfig({
  plugins: [geaPlugin(), disableGeaHmr],
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

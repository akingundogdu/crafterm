import { defineConfig } from '@playwright/test'

// E2E drives the real Electron app via Playwright's _electron. Needs a built
// bundle (`npm run build`) and a display, so it is best run on a developer
// machine (`npm run e2e`), not headless CI without a display.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list'
})

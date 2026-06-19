import { defineConfig } from '@playwright/test'

// E2E drives the real Electron app via Playwright's _electron. Needs a built
// bundle (`npm run build`) and a display, so it is best run on a developer
// machine (`npm run e2e`), not headless CI without a display.
export default defineConfig({
  testDir: './src/tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  // Visual-regression guard for the Phase 8 CSS split: screenshots must stay
  // pixel-identical across the move. Animations/caret are killed for determinism;
  // a tiny diff ratio absorbs sub-pixel font AA noise.
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.01
    }
  }
})

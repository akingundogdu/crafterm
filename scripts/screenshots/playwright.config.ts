import { defineConfig } from '@playwright/test'

// The README screenshot/GIF generator. Not a test suite: each spec drives the real
// Electron build against a generated demo workspace and writes docs/images/*.gif.
// Needs a built bundle (`npm run build`) and ffmpeg on PATH — `npm run screenshots`
// does both steps.
export default defineConfig({
  testDir: '.',
  testMatch: 'features/*.spec.ts',
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list'
})

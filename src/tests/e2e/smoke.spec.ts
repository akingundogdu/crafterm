import { test, type ElectronApplication } from '@playwright/test'
import { freshStateDir, launchApp, closeApp } from './_harness.js'

// First regression net (Phase 0): the app launches and shows its UI, against an
// isolated throwaway state dir — never the real ~/.crafterm (HR-5). launchApp
// asserts the shell is visible; freshStateDir enforces HR-5.
let stateDir = ''
let app: ElectronApplication | null = null

test('app launches with an isolated state dir and shows the shell (HR-5)', async () => {
  stateDir = freshStateDir()
  app = (await launchApp(stateDir)).app
})

test.afterAll(async () => {
  await closeApp(app, stateDir)
})

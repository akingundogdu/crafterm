import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { freshStateDir, launchApp, closeApp } from './_harness.js'

// Phase 8 visual-regression guard. The baseline is captured against the pre-split
// style.css; every CSS co-location / class-rename commit must reproduce these
// pixels exactly. Dynamic regions (live terminal output, version/usage chips) are
// masked so the diff is driven by styling, not by shell content.

let app: ElectronApplication | null = null
let stateDir = ''

test.beforeAll(async () => {
  stateDir = freshStateDir()
  ;({ app } = await launchApp(stateDir))
})

test.afterAll(async () => {
  await closeApp(app, stateDir)
})

// Live/non-deterministic surfaces masked out of every screenshot.
function masks(win: Page) {
  return [
    win.locator('.pane-term'),
    win.locator('#statusbar-version'),
    win.locator('#statusbar-claude-usage')
  ]
}

test('visual: main shell', async () => {
  const win = await app!.firstWindow()
  await expect(win).toHaveScreenshot('main-shell.png', { mask: masks(win) })
})

test('visual: settings modal', async () => {
  const win = await app!.firstWindow()
  await win.locator('#settings-btn').click()
  const modal = win.locator('.modal.settings-modal')
  await expect(modal).toBeVisible()
  await expect(modal).toHaveScreenshot('settings-modal.png')
  await modal.locator('.modal-close').first().click()
  await expect(modal).toHaveCount(0)
})

test('visual: notification panel', async () => {
  const win = await app!.firstWindow()
  // The panel toggles via #app.notif-open; open it only if it's currently closed.
  if ((await win.locator('#app.notif-open').count()) === 0) {
    await win.locator('#statusbar-notif-toggle').click()
  }
  await expect(win.locator('#app.notif-open')).toHaveCount(1)
  const panel = win.locator('#notif-panel')
  await expect(panel).toBeVisible()
  await expect(panel).toHaveScreenshot('notif-panel.png', { mask: masks(win) })
})

import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// Phase 8 visual-regression guard. The baseline is captured against the pre-split
// style.css; every CSS co-location / class-rename commit must reproduce these
// pixels exactly. Dynamic regions (live terminal output, version/usage chips) are
// masked so the diff is driven by styling, not by shell content.

function freshDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'crafterm-e2e-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(d)) throw new Error('HR-5 violated: refusing real state dir')
  return d
}

let app: ElectronApplication | null = null
let stateDir = ''

test.beforeAll(async () => {
  stateDir = freshDir()
  app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: stateDir } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
})

test.afterAll(async () => {
  if (app) await app.close()
  if (stateDir) rmSync(stateDir, { recursive: true, force: true })
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

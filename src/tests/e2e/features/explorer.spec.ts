import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { freshStateDir, launchApp, closeApp } from '../_harness.js'

// Phase 6: the file explorer moved to screens/explorer/ (createTreeView + the
// extracted file-icons). Drive it through the real UI — open a terminal so a
// root resolves, switch to the Files tab, and assert the tree renders rows.
// HR-5: throwaway state dir, never the real ~/.crafterm.

let stateDir = ''
let app: ElectronApplication | null = null
let win: Page

test.beforeAll(async () => {
  stateDir = freshStateDir('crafterm-e2e-explorer-')
  const launched = await launchApp(stateDir)
  app = launched.app
  win = launched.win
})

test.afterAll(async () => {
  await closeApp(app, stateDir)
})

test('Files tab renders the explorer tree for the active terminal root', async () => {
  // A terminal gives the explorer a root (active pane cwd). Click the pane so it
  // becomes the active pane (explorerRoot reads state.activePaneId), then wait for
  // the cwd to resolve (status bar) so renderExplorer has a real directory.
  await win.locator('#new-tab').click()
  // A bare mousedown on the pane selects it (sets state.activePaneId). Dispatch
  // the event directly — the xterm host reports as not-"visible" to Playwright's
  // click heuristic, but the listener only needs the mousedown.
  await win.locator('.pane-box').first().dispatchEvent('mousedown')
  await expect(win.locator('.pane-status .pane-status-seg.cwd').first()).toContainText(/\S/, {
    timeout: 20_000
  })

  await win.locator('#notif-tab-files').click()

  // explorerRoot resolved → the root label is populated…
  await expect(win.locator('#explorer-root')).toContainText(/\S/, { timeout: 20_000 })
  // …and createTreeView rendered at least one row into the tree host.
  await expect
    .poll(() => win.locator('#explorer-tree').evaluate((el) => el.childElementCount), {
      timeout: 20_000
    })
    .toBeGreaterThan(0)
})

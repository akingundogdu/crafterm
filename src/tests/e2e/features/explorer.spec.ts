import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// Phase 6: the file explorer moved to screens/explorer/ (createTreeView + the
// extracted file-icons). Drive it through the real UI — open a terminal so a
// root resolves, switch to the Files tab, and assert the tree renders rows.
// HR-5: throwaway state dir, never the real ~/.crafterm.

let stateDir = ''
let app: ElectronApplication | null = null
let win: Page

test.beforeAll(async () => {
  stateDir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-explorer-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(stateDir)) throw new Error('HR-5 violated: refusing real state dir')
  app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: stateDir } })
  win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
})

test.afterAll(async () => {
  if (app) await app.close()
  if (stateDir) rmSync(stateDir, { recursive: true, force: true })
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

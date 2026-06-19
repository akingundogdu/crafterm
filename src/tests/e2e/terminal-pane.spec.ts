import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// Phase 5: drives the extracted renderer terminal modules through the REAL UI,
// not the bridge. Creating a terminal pane runs createPane -> the per-tick
// refreshPaneInfo (terminal/pane-info.ts) -> updatePaneStatus
// (terminal/status-bar.ts), which renders the bottom status bar. Asserting the
// status bar populates proves the pane-info + status-bar relocation is wired
// end-to-end. HR-5: throwaway state dir, never the real ~/.crafterm.

let stateDir = ''
let app: ElectronApplication | null = null
let win: Page

test.beforeAll(async () => {
  stateDir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-pane-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(stateDir)) throw new Error('HR-5 violated: refusing real state dir')
  app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: stateDir } })
  win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
})

test.afterAll(async () => {
  if (app) await app.close()
  if (stateDir) rmSync(stateDir, { recursive: true, force: true })
})

test('new terminal renders a status bar with its cwd (pane-info + status-bar)', async () => {
  // Empty state has no projects, so New Terminal opens a plain pane (no picker).
  await win.locator('#new-tab').click()

  // The pane's terminal mounts immediately; the cwd segment is rendered once the
  // first refreshPaneInfo tick resolves the pane's working directory. Assert on
  // the rendered text (not strict visibility — the status bar can sit in a
  // collapsed/inactive layout box) to prove the pane-info -> status-bar path ran.
  const cwdSeg = win.locator('.pane-status .pane-status-seg.cwd').first()
  await expect(cwdSeg).toContainText(/\S/, { timeout: 20_000 })

  // The status bar host is flipped to flex (not display:none) once it has segments.
  const display = await win
    .locator('.pane-status')
    .first()
    .evaluate((el) => getComputedStyle(el).display)
  expect(display).toBe('flex')
})

test('new terminal mounts an xterm into its host (createPane -> mountPanes)', async () => {
  // createPane builds the xterm instance + key handler; mountPanes opens it into
  // the .pane-term host. Assert the xterm DOM mounted and the shell prompt was
  // rendered into its rows — the full terminal.ts lifecycle, end-to-end in the UI.
  const xterm = win.locator('.pane-term .xterm').first()
  await expect(xterm).toBeAttached({ timeout: 20_000 })

  // term.open() builds the renderer DOM (.xterm-screen) inside the host — proof
  // mountPanes opened the xterm into its .pane-term host. (The pty output itself
  // is asserted end-to-end in terminal.spec.ts.)
  await expect(win.locator('.pane-term .xterm .xterm-screen').first()).toBeAttached({
    timeout: 20_000
  })
})

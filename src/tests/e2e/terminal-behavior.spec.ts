import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Terminal runtime (§2): a real pty + real zsh driven through the UI. Asserts the
// RENDERED xterm screen (terminal.spec only checks the raw bridge) and that `cd`
// moves the status-bar cwd. HR-5: throwaway state dir only.

function freshStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-beh-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(dir)) throw new Error('HR-5 violated: refusing real state dir')
  return dir
}
async function launch(dir: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: dir } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}

test('terminal: a typed command renders into the xterm screen', async () => {
  const dir = freshStateDir()
  const { app, win } = await launch(dir)
  const token = `XTERM_${Date.now()}`
  try {
    await expect(win.locator('.pane-box')).toHaveCount(1)
    await win.locator('.pane-term').first().click() // focus the xterm
    await win.keyboard.type(`echo ${token}`)
    await win.keyboard.press('Enter')
    await expect(win.locator('.pane-term .xterm-rows')).toContainText(token, { timeout: 10_000 })
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('terminal: cd moves the status-bar cwd', async () => {
  const dir = freshStateDir()
  const { app, win } = await launch(dir)
  try {
    await expect(win.locator('.pane-box')).toHaveCount(1)
    await win.locator('.pane-term').first().click()
    await win.keyboard.type('cd /tmp')
    await win.keyboard.press('Enter')
    // cwd discovery runs on the ~4s lsof refresh; /tmp resolves to /private/tmp on macOS
    await expect(win.locator('.pane-box.active .pane-status-seg.cwd')).toContainText('tmp', { timeout: 15_000 })
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('terminal: a long command in an inactive pane fires a notification card', async () => {
  const dir = freshStateDir()
  const { app, win } = await launch(dir)
  try {
    await expect(win.locator('.pane-box')).toHaveCount(1)
    await win.keyboard.press('Meta+d') // split -> two panes
    await expect(win.locator('.pane-box')).toHaveCount(2)
    const boxes = win.locator('.pane-box')

    // run a >3s command in pane 0, then activate pane 1 so pane 0 is "unattended"
    await boxes.nth(0).locator('.pane-term').click()
    await win.keyboard.type('sleep 3.5')
    await win.keyboard.press('Enter')
    await boxes.nth(1).locator('.pane-term').click()

    const open = await win.locator('#app').evaluate((el) => el.classList.contains('notif-open'))
    if (!open) await win.locator('#statusbar-notif-toggle').click()
    await expect(win.locator('#notif-list .notif-card').first()).toBeVisible({ timeout: 15_000 })
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

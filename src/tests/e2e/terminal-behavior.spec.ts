import { test, expect } from '@playwright/test'
import { freshStateDir, launchApp, openTerminal, closeApp } from './_harness.js'

// Terminal runtime (§2): a real pty + real zsh driven through the UI. Asserts the
// RENDERED xterm screen (terminal.spec only checks the raw bridge) and that `cd`
// moves the status-bar cwd. HR-5: throwaway state dir only.

test('terminal: a typed command renders into the xterm screen', async () => {
  const dir = freshStateDir('crafterm-e2e-beh-')
  const { app, win } = await launchApp(dir)
  const token = `XTERM_${Date.now()}`
  try {
    await openTerminal(win)
    await win.locator('.pane-term').first().click() // focus the xterm
    await win.keyboard.type(`echo ${token}`)
    await win.keyboard.press('Enter')
    await expect(win.locator('.pane-term .xterm-rows')).toContainText(token, { timeout: 10_000 })
  } finally {
    await closeApp(app, dir)
  }
})

test('terminal: cd moves the status-bar cwd', async () => {
  const dir = freshStateDir('crafterm-e2e-beh-')
  const { app, win } = await launchApp(dir)
  try {
    await openTerminal(win)
    await win.locator('.pane-term').first().click()
    await win.keyboard.type('cd /tmp')
    await win.keyboard.press('Enter')
    // cwd discovery runs on the ~4s lsof refresh; /tmp resolves to /private/tmp on macOS
    await expect(win.locator('.pane-box.active .pane-status-seg.cwd')).toContainText('tmp', { timeout: 15_000 })
  } finally {
    await closeApp(app, dir)
  }
})

test('terminal: a long command in an inactive pane fires a notification card', async () => {
  const dir = freshStateDir('crafterm-e2e-beh-')
  const { app, win } = await launchApp(dir)
  try {
    await openTerminal(win)
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
    await closeApp(app, dir)
  }
})

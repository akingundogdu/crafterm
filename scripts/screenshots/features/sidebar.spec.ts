import { test, expect } from '@playwright/test'
import { launchDemo, closeDemo, assertNoPrivateData } from '../lib/harness.js'
import { Recorder } from '../lib/recorder.js'

// README §"Project / folder sidebar" — projects, their terminals and their git
// worktrees in one tree, with per-row status, git branch and a context menu.
test('sidebar tree', async () => {
  const { app, win } = await launchDemo()
  try {
    const rec = new Recorder(win, 'sidebar')
    await rec.hold(800)

    // Expand the second project, so the tree shows both projects' terminals.
    await win.locator('#tab-list .tab-item', { hasText: 'acme-api' }).first().click()
    await rec.hold(1100)

    // Per-row context menu (pin, rename, worktrees, close…).
    await win.locator('#tab-list .tab-item', { hasText: 'checkout' }).first().click({ button: 'right' })
    await expect(win.locator('.context-menu')).toBeVisible()
    await rec.hold(1600)
    await win.keyboard.press('Escape')
    await win.mouse.click(700, 500)
    await rec.hold(500)

    // Search filters the whole tree as you type.
    await win.locator('#search-input').click()
    await rec.typeText('cart')
    await rec.hold(1400)
    await win.locator('#search-input').fill('')
    await rec.hold(800)

    await assertNoPrivateData(win)
    rec.encode()
  } finally {
    await closeDemo(app)
  }
})

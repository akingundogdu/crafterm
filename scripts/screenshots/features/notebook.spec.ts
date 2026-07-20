import { test, expect } from '@playwright/test'
import { launchDemo, closeDemo, assertNoPrivateData } from '../lib/harness.js'
import { Recorder } from '../lib/recorder.js'

// README §"Notebook" — a markdown notebook next to the terminals: notes, plans,
// the compact daily board and meeting notes.
test('notebook', async () => {
  const { app, win } = await launchDemo()
  try {
    await win.locator('#tab-notebook').click()
    await expect(win.locator('#app')).toHaveClass(/mode-notebook/)

    const rec = new Recorder(win, 'notebook')
    await rec.hold(900)

    await win.locator('#tab-list .tab-item', { hasText: 'Checkout rewrite' }).first().click()
    await expect(win.locator('.pane-box.doc-pane')).toBeVisible({ timeout: 10_000 })
    await rec.hold(1800)

    await win.locator('.notebook-mode-tab', { hasText: /Daily Plan/i }).click()
    await rec.hold(1600)
    await win.locator('.notebook-mode-tab', { hasText: /Meeting/i }).click()
    await rec.hold(1700)
    await win.locator('.notebook-mode-tab').first().click()
    await rec.hold(900)

    await assertNoPrivateData(win)
    rec.encode()
  } finally {
    await closeDemo(app)
  }
})

import { test, expect } from '@playwright/test'
import { launchDemo, closeDemo, assertNoPrivateData } from '../lib/harness.js'
import { Recorder } from '../lib/recorder.js'

// README §"Markdown, docs & browser panes" — clicking a file in the explorer opens it
// beside the terminal: source in a Monaco pane, markdown rendered in a doc pane.
test('code and doc panes', async () => {
  const { app, win } = await launchDemo()
  try {
    await win.locator('#tab-list .tab-item', { hasText: 'build' }).first().click()
    await win.locator('#notif-tab-files').click()
    await expect(win.locator('#explorer-tree')).toBeVisible()

    const rec = new Recorder(win, 'code-and-docs')
    await rec.hold(800)

    await win.locator('#explorer-tree').getByText('src', { exact: true }).first().click()
    await rec.hold(700)
    await win.locator('#explorer-tree').getByText('routes', { exact: true }).first().click()
    await rec.hold(700)
    await win.locator('#explorer-tree').getByText('checkout.ts', { exact: true }).first().click()
    await expect(win.locator('.pane-box.code-pane')).toBeVisible({ timeout: 15_000 })
    await rec.hold(2200)

    // A markdown file opens as a rendered doc pane instead.
    await win.locator('#explorer-tree').getByText('docs', { exact: true }).first().click()
    await rec.hold(600)
    await win.locator('#explorer-tree').getByText('checkout-notes.md', { exact: true }).first().click()
    await expect(win.locator('.pane-box.doc-pane')).toBeVisible({ timeout: 15_000 })
    await rec.hold(2400)

    await assertNoPrivateData(win)
    rec.encode()
  } finally {
    await closeDemo(app)
  }
})

import { test, expect } from '@playwright/test'
import { launchDemo, closeDemo, assertNoPrivateData } from '../lib/harness.js'
import { Recorder } from '../lib/recorder.js'

// README §"Terminals & splits" — real shells in a split layout. Every command below
// really runs, in the generated demo repo (scripts/screenshots/lib/demo-repo.ts).
// The right panel is collapsed first so the panes are wide enough to read.
test('terminals and splits', async () => {
  const { app, win } = await launchDemo()
  try {
    await win.locator('#statusbar-notif-toggle').click()
    await win.locator('#tab-list .tab-item', { hasText: 'build' }).first().click()
    await expect(win.locator('.pane-box')).toHaveCount(1)

    const rec = new Recorder(win, 'terminals-splits')
    await rec.hold(600)

    await win.locator('.pane-box.active .pane-term').click()
    await rec.runCommand('git log --oneline --graph -6', 1600)
    await rec.hold(600)

    // Split the pane and run the unit suite in the new one.
    await win.keyboard.press('Meta+d')
    await expect(win.locator('.pane-box')).toHaveCount(2)
    await rec.hold(900)
    await win.locator('.pane-box.active .pane-term').click()
    await rec.runCommand('npm test', 2400)
    await rec.hold(1400)

    await assertNoPrivateData(win)
    rec.encode()
  } finally {
    await closeDemo(app)
  }
})

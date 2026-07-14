import { test, expect } from '@playwright/test'
import { launchDemo, closeDemo, assertNoPrivateData } from '../lib/harness.js'
import { Recorder } from '../lib/recorder.js'

// README §"Right-side panel" — alerts, reminders, the file explorer and time
// tracking share one panel next to the terminals.
test('right side panel', async () => {
  const { app, win } = await launchDemo()
  try {
    const rec = new Recorder(win, 'right-panel')
    await rec.hold(800)

    await win.locator('#notif-tab-reminders').click()
    await expect(win.locator('#reminder-list')).toBeVisible()
    await rec.hold(1600)

    await win.locator('#notif-tab-files').click()
    await expect(win.locator('#explorer-tree')).toBeVisible()
    await rec.hold(1600)

    await win.locator('#notif-tab-time').click()
    await expect(win.locator('#time-summary')).toBeVisible()
    await rec.hold(1600)

    await win.locator('#notif-tab-bm').click()
    await expect(win.locator('#notif-bm-view')).toBeVisible()
    await rec.hold(1600)

    await win.locator('#notif-tab-notifs').click()
    await rec.hold(1200)

    await assertNoPrivateData(win)
    rec.encode()
  } finally {
    await closeDemo(app)
  }
})

import { test, expect } from '@playwright/test'
import { launchDemo, closeDemo, assertNoPrivateData } from '../lib/harness.js'
import { Recorder } from '../lib/recorder.js'

// README §"Smart notifications" — a card per terminal event (Claude finished, Claude
// needs input, a build ended), grouped per terminal and filterable by status/project.
test('notifications', async () => {
  const { app, win } = await launchDemo()
  try {
    await win.locator('#notif-tab-notifs').click()
    await expect(win.locator('#notif-list')).toBeVisible()

    const rec = new Recorder(win, 'notifications')
    await rec.hold(1000)

    // The Alerts list re-renders on a timer (the "2m ago" stamps), so a plain click
    // never sees a "stable" element — force past the actionability wait.
    const click = async (selector: string, text: RegExp): Promise<void> => {
      await win.locator(selector, { hasText: text }).first().click({ force: true })
    }

    // Expand the grouped card (several alerts from one terminal collapse into one).
    await click('.notif-group-head', /build/)
    await rec.hold(1600)

    // Status filter chips.
    await click('.notif-filter-chip', /^Question$/)
    await rec.hold(1500)
    await click('.notif-filter-chip', /^All$/)
    await rec.hold(900)

    // Project filter chips.
    await click('.notif-filter-chip', /acme-api/)
    await rec.hold(1600)
    await click('.notif-filter-chip', /All projects/)
    await rec.hold(1200)

    await assertNoPrivateData(win)
    rec.encode()
  } finally {
    await closeDemo(app)
  }
})

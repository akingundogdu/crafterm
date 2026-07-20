import { test, expect } from '@playwright/test'
import { launchDemo, closeDemo, assertNoPrivateData } from '../lib/harness.js'
import { Recorder } from '../lib/recorder.js'

// README §"Docker, databases & PRs" (PR half) — open PRs with their review/checks
// state, and the diff opening in a pane. `gh` is stubbed (scripts/screenshots/lib/stubs.ts):
// no GitHub account, no network.
test('pull requests and the diff pane', async () => {
  const { app, win } = await launchDemo()
  try {
    await win.locator('#notif-tab-pr').click()
    await win.locator('.pr-scopetabs .pr-subtab', { hasText: /all/i }).click()
    const card = win.locator('#notif-pr-view .pr-card', { hasText: '#128' })
    await expect(card).toBeVisible({ timeout: 15_000 })

    const rec = new Recorder(win, 'pull-requests')
    await rec.hold(2000)

    await card.locator('.pr-act', { hasText: /diff/i }).first().click()
    await expect(win.locator('.pane-box.diff-pane')).toBeVisible({ timeout: 15_000 })
    await rec.hold(2400)

    await assertNoPrivateData(win)
    rec.encode()
  } finally {
    await closeDemo(app)
  }
})

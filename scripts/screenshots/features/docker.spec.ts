import { test, expect } from '@playwright/test'
import { launchDemo, closeDemo, assertNoPrivateData } from '../lib/harness.js'
import { Recorder } from '../lib/recorder.js'

// README §"Docker, databases & PRs" (docker half) — containers, images, volumes and
// networks in the sidebar. The `docker` CLI is stubbed (scripts/screenshots/lib/stubs.ts):
// no daemon, no real containers.
test('docker panel', async () => {
  const { app, win } = await launchDemo()
  try {
    await win.locator('#tab-docker').click()
    await expect(win.locator('#tab-list .docker-row').first()).toBeVisible({ timeout: 15_000 })

    const rec = new Recorder(win, 'docker')
    await rec.hold(1600)

    for (const sub of [/Images/i, /Volumes/i, /Networks/i]) {
      const tab = win.locator('.docker-subtab', { hasText: sub })
      if (await tab.count()) {
        await tab.first().click()
        await rec.hold(1500)
      }
    }
    await win.locator('.docker-subtab').first().click()
    await rec.hold(1200)

    await assertNoPrivateData(win)
    rec.encode()
  } finally {
    await closeDemo(app)
  }
})

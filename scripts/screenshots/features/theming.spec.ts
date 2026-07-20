import { test, expect } from '@playwright/test'
import { launchDemo, closeDemo, assertNoPrivateData } from '../lib/harness.js'
import { Recorder } from '../lib/recorder.js'

// README §"Theming & appearance" — pick a theme and the terminals recolor live; the
// custom palette exposes all 22 ANSI colors.
test('theming', async () => {
  const { app, win } = await launchDemo()
  try {
    await win.locator('#tab-list .tab-item', { hasText: 'checkout' }).first().click()
    await win.locator('#settings-btn').click()
    await expect(win.locator('.modal.settings-modal')).toBeVisible()

    const rec = new Recorder(win, 'theming')
    await rec.hold(800)

    await win.locator('.settings-nav .settings-nav-item', { hasText: /^Theme$/ }).click()
    await rec.hold(1200)

    const select = win.locator('.modal.settings-modal .settings-panel:visible select').first()
    for (const theme of ['Tokyo Night', 'One Dark', 'Solarized Dark']) {
      await select.selectOption({ label: theme })
      await rec.hold(1300)
    }

    await select.selectOption({ label: 'Custom' })
    await expect(win.locator('.color-grid')).toBeVisible()
    await rec.hold(1800)

    await assertNoPrivateData(win)
    rec.encode()
  } finally {
    await closeDemo(app)
  }
})

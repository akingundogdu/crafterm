import { test, expect } from '@playwright/test'
import { launchDemo, closeDemo, assertNoPrivateData, openWithShortcut } from '../lib/harness.js'
import { Recorder } from '../lib/recorder.js'

// README §"Improve — built-in todo editor" — the backlog editor over todo-list.json:
// Todo / Ready to test / Done, and a box to file a new request.
test('improve todo editor', async () => {
  const { app, win } = await launchDemo()
  try {
    await openWithShortcut(win, 'Meta+Shift+l', '.modal.improve-modal')

    const rec = new Recorder(win, 'improve')
    await rec.hold(1200)

    await win.locator('.improve-tab', { hasText: /Ready to test/i }).click()
    await rec.hold(1400)
    await win.locator('.improve-tab', { hasText: /^Done/i }).click()
    await rec.hold(1400)
    await win.locator('.improve-tab').first().click()
    await rec.hold(700)

    await win.locator('button', { hasText: /Request new feature/i }).first().click()
    await expect(win.locator('.improve-textarea')).toBeVisible()
    await win.locator('.improve-textarea').click()
    await rec.typeText('Remember the last used base branch per project')
    await rec.hold(1500)

    await assertNoPrivateData(win)
    rec.encode()
  } finally {
    await closeDemo(app)
  }
})

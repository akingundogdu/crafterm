import { test, expect } from '@playwright/test'
import { launchDemo, closeDemo, assertNoPrivateData, openWithShortcut } from '../lib/harness.js'
import { Recorder } from '../lib/recorder.js'

// README §"Agent composer" — the start screen: pick a project and base branch, type
// what you want, and the "/" menu turns the prompt into a plan / build / worktree run.
test('agent composer', async () => {
  const { app, win } = await launchDemo()
  try {
    await openWithShortcut(win, 'Meta+Shift+N', '.agent-composer')
    await expect(win.locator('.agent-composer-input')).toBeVisible()

    const rec = new Recorder(win, 'agent-composer')
    await rec.hold(700)

    await win.locator('.agent-composer-input').click()
    await rec.typeText('Add dark mode to the checkout summary card')
    await rec.hold(600)

    // "/" opens the slash menu (plan / build / local / worktree).
    await win.keyboard.type(' ')
    await win.keyboard.type('/')
    await expect(win.locator('.agent-composer-slash')).toBeVisible()
    await rec.hold(900)

    await win.keyboard.press('ArrowDown')
    await rec.hold(500)
    await win.keyboard.press('ArrowDown')
    await rec.hold(900)

    await win.keyboard.press('Escape')
    await rec.hold(400)
    await win.locator('.agent-composer-toggle-btn', { hasText: /plan/i }).click()
    await rec.hold(1200)

    await assertNoPrivateData(win)
    rec.encode()
  } finally {
    await closeDemo(app)
  }
})

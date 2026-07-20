import { test, expect } from '@playwright/test'
import { launchDemo, closeDemo, assertNoPrivateData, openWithShortcut } from '../lib/harness.js'
import { Recorder } from '../lib/recorder.js'

// README §"Agent composer" — the start screen: pick a project, base branch and Daily
// Plan labels, type what you want, and the "/" menu turns the prompt into a plan /
// build / worktree run. Labels are reachable both ways: the dropdown in the context
// row and "/<name>" in the prompt (the same selection, toggled).
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

    // Labels dropdown: the Daily Plan tags the filed ticket is created with.
    await win.locator('.composer-labels-btn').click()
    await expect(win.locator('.composer-labels-menu')).toBeVisible()
    await rec.hold(900)
    await win.locator('.composer-labels-row', { hasText: 'frontend' }).click()
    await rec.hold(1100)
    await win.keyboard.press('Escape')
    await rec.hold(700)

    // "/" opens the slash menu — projects, labels and modes in one list.
    await win.locator('.agent-composer-input').click()
    await win.keyboard.type(' ')
    await win.keyboard.type('/')
    await expect(win.locator('.agent-composer-slash')).toBeVisible()
    await rec.hold(1000)

    // Typing narrows it to a label; picking it toggles the same selection.
    await rec.typeText('bug', 1)
    await rec.hold(1000)
    await win.keyboard.press('Enter')
    await rec.hold(1400)

    await win.locator('.agent-composer-toggle-btn', { hasText: /plan/i }).click()
    await rec.hold(1400)

    await assertNoPrivateData(win)
    rec.encode()
  } finally {
    await closeDemo(app)
  }
})

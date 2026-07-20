import { test, expect } from '@playwright/test'
import { launchDemo, closeDemo, assertNoPrivateData, openWithShortcut, closeOverlays } from '../lib/harness.js'
import { Recorder } from '../lib/recorder.js'

// README §"Spotlight, pickers & command palette" — one search box over files,
// commands, terminals, plans and projects, plus the command palette.
test('spotlight and command palette', async () => {
  const { app, win } = await launchDemo()
  try {
    const rec = new Recorder(win, 'spotlight')

    await openWithShortcut(win, 'Meta+p', '.spotlight-modal')
    await rec.hold(700)

    await win.locator('.spotlight-modal input.search-box-input').click()
    await rec.typeText('checkout')
    await rec.hold(1200)

    // The tab strip scopes the same query: files, then commands.
    await win.locator('button.spot-tab', { hasText: /^Files$/ }).click()
    await rec.hold(1300)
    await win.locator('button.spot-tab', { hasText: /^Terminals$/ }).click()
    await rec.hold(1300)

    await closeOverlays(win)
    await rec.hold(400)

    // Command palette: the user's saved commands, grouped by category.
    await openWithShortcut(win, 'Meta+Shift+p', '.picker-modal')
    await rec.hold(900)
    await win.locator('.picker-modal input.search-box-input').click()
    await rec.typeText('git')
    await rec.hold(1500)

    await assertNoPrivateData(win)
    rec.encode()
  } finally {
    await closeDemo(app)
  }
})

import { test, expect } from '@playwright/test'
import { launchDemo, closeDemo, assertNoPrivateData } from '../lib/harness.js'
import { Recorder } from '../lib/recorder.js'

// README §"Daily plan & tickets" — the kanban board: drag a ticket across columns,
// then narrow the board with a tag filter.
test('daily plan board', async () => {
  const { app, win } = await launchDemo()
  try {
    await win.locator('#sidebar-actions').click()
    await win.locator('.context-menu button', { hasText: 'Daily plan' }).click()
    const board = win.locator('.modal.daily-plan-modal')
    await expect(board).toBeVisible({ timeout: 10_000 })

    const rec = new Recorder(win, 'daily-plan')
    await rec.hold(1000)

    // Drag "Cart persistence across devices" from To do into In progress, capturing
    // the pointer along the way so the GIF shows the card actually moving.
    const card = board.locator('.daily-plan-card', { hasText: 'Cart persistence' }).first()
    const target = board.locator('.daily-plan-column[data-status="wip"] .daily-plan-column-body')
    const from = await card.boundingBox()
    const to = await target.boundingBox()
    if (from && to) {
      await win.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
      await win.mouse.down()
      await rec.frame(2)
      const steps = 12
      for (let i = 1; i <= steps; i++) {
        const x = from.x + from.width / 2 + ((to.x + to.width / 2 - from.x - from.width / 2) * i) / steps
        const y = from.y + from.height / 2 + ((to.y + 60 - from.y - from.height / 2) * i) / steps
        await win.mouse.move(x, y)
        await rec.frame()
      }
      await win.mouse.up()
      await rec.hold(1200)
    }

    // Tag filter: only the frontend tickets stay on the board.
    await board.locator('.daily-tagfilter-btn').click()
    await rec.hold(700)
    await win.locator('.daily-tagfilter-pop .daily-tagfilter-row', { hasText: 'api' }).click()
    await rec.hold(1500)

    await assertNoPrivateData(win)
    rec.encode()
  } finally {
    await closeDemo(app)
  }
})

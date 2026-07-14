import { test, expect } from '@playwright/test'
import { launchDemo, closeDemo, assertNoPrivateData } from '../lib/harness.js'
import { Recorder } from '../lib/recorder.js'

// README §"iOS worktrees" — an iOS project's worktrees get build & run actions right
// on the sidebar row: pick a simulator or a device, then a scheme.
test('ios worktrees', async () => {
  const { app, win } = await launchDemo({ ios: true })
  try {
    const worktree = win.locator('#tab-list .tab-item', { hasText: 'dark-mode' }).first()
    await expect(worktree).toBeVisible({ timeout: 15_000 })

    const rec = new Recorder(win, 'ios-worktrees')
    await rec.hold(900)

    await worktree.hover()
    await rec.hold(600)
    await worktree.locator('button.ios-wt-act').last().click()
    await expect(win.locator('.context-menu')).toBeVisible({ timeout: 10_000 })
    await rec.hold(1400)

    // Walk into the cascading submenu (Build & Run → simulator/device).
    const first = win.locator('.context-menu button').first()
    await first.hover()
    await rec.hold(1800)

    await assertNoPrivateData(win)
    rec.encode()
  } finally {
    await closeDemo(app)
  }
})

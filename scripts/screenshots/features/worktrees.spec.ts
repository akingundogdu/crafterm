import { test, expect } from '@playwright/test'
import { launchDemo, closeDemo, assertNoPrivateData } from '../lib/harness.js'
import { Recorder } from '../lib/recorder.js'

// README §"Git & worktrees" — create a git worktree from the sidebar and watch it
// appear as a first-class node. The `git worktree add` below really runs, in the
// generated demo repo.
test('git worktrees', async () => {
  const { app, win } = await launchDemo()
  try {
    const container = win.locator('#tab-list .tab-item', { hasText: 'worktrees' }).first()
    await expect(container).toBeVisible({ timeout: 15_000 })

    const rec = new Recorder(win, 'worktrees')
    await rec.hold(900)

    await container.click({ button: 'right' })
    await rec.hold(800)
    await win.locator('.context-menu button', { hasText: /New worktree/i }).click()
    await expect(win.locator('.modal-overlay')).toBeVisible()
    await rec.hold(700)

    await win.locator('.modal-overlay input').first().click()
    await rec.typeText('feature/promo-stacking')
    await rec.hold(600)
    await win.locator('.modal-overlay .modal-actions button.button-primary').click()

    // The creation runs git for real; the new node lands in the tree.
    await expect(win.locator('#tab-list .tab-item', { hasText: 'promo-stacking' })).toBeVisible({ timeout: 30_000 })
    await rec.hold(2600)

    await assertNoPrivateData(win)
    rec.encode()
  } finally {
    await closeDemo(app)
  }
})

import { test, expect } from '@playwright/test'
import { freshStateDir, launchApp, closeApp } from './_harness.js'

// Sidebar session-node details (§3): the per-node detail toggles reveal a detail
// line + a pane sub-list under an expanded session, and recency grouping buckets
// sessions under date headers. HR-5: throwaway state dir only.

test('sidebar details: toggles reveal detail line + pane sub-list; recency buckets', async () => {
  const dir = freshStateDir('crafterm-e2e-det-')
  const { app, win } = await launchApp(dir)
  try {
    await test.step('split the starter session (2 panes)', async () => {
      // fresh launch auto-creates one starter terminal
      await expect(win.locator('.pane-box')).toHaveCount(1)
      await win.keyboard.press('Meta+d')
      await expect(win.locator('.pane-box')).toHaveCount(2)
    })

    await test.step('enable detail toggles + recency in Settings', async () => {
      await win.locator('#settings-btn').click()
      const modal = win.locator('.modal.settings-modal')
      await expect(modal).toBeVisible()
      await modal.locator('.settings-nav-item', { hasText: 'Sidebar' }).click()
      const panel = modal.locator('.settings-panel').filter({ hasText: 'Show pane count' })
      await panel.locator('.checkbox-row:has-text("Show pane count") input[type="checkbox"]').check()
      await panel.locator('.checkbox-row:has-text("Show panes under terminal") input[type="checkbox"]').check()
      await panel.locator('.checkbox-row:has-text("Group by recency") input[type="checkbox"]').check()
      await modal.locator('.modal-close').first().click()
      await expect(modal).toBeHidden()
    })

    await test.step('expand chevron → detail line + pane sub-rows', async () => {
      const row = win.locator('#tab-list .tab-item').first()
      await row.locator('.treeview-chevron').click()
      const below = win.locator('#tab-list .tab-below')
      await expect(below.locator('.tab-sub')).toContainText('panes')
      await expect(below.locator('.tab-panes .tab-pane-row')).toHaveCount(2)
    })

    await test.step('recency grouping shows a Today header', async () => {
      await expect(win.locator('#tab-list .section-label', { hasText: 'Today' })).toBeVisible()
    })
  } finally {
    await closeApp(app, dir)
  }
})

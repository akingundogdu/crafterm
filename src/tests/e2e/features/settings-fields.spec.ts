import { test, expect, type Page } from '@playwright/test'
import { freshStateDir, launchApp, readState, closeApp } from '../_harness.js'

// Settings §5 fields (the deterministic, valuable ones): Appearance font/theme
// persist across relaunch, the Tabs display-mode + per-tab-hide apply live + persist,
// and the save-status chip flips to "Saved" after an edit. HR-5: throwaway dir only.

async function openSettingsTab(win: Page, navText: string): Promise<ReturnType<Page['locator']>> {
  await win.locator('#settings-btn').click()
  const modal = win.locator('.modal.settings-modal')
  await expect(modal).toBeVisible({ timeout: 10_000 })
  await modal.locator('.settings-nav-item', { hasText: navText }).click()
  return modal
}

test('settings-fields: Appearance font + code-editor theme persist across relaunch', async () => {
  const dir = freshStateDir('crafterm-e2e-sf-')
  let { app, win } = await launchApp(dir)
  try {
    const panel = (await openSettingsTab(win, 'Appearance')).locator('.settings-panel:visible')
    await panel.locator('.field', { hasText: 'Terminal font size' }).locator('input').fill('20')
    await win.keyboard.press('Tab') // commit on change/blur
    await panel.locator('.field', { hasText: 'Font family' }).locator('input').fill('Menlo')
    await win.keyboard.press('Tab')
    await panel.locator('.field', { hasText: 'Code editor theme' }).locator('select').selectOption({ label: 'Dracula' })

    await expect.poll(() => readState(dir)?.font?.size, { timeout: 5_000 }).toBe(20)
    await expect.poll(() => readState(dir)?.font?.family).toBe('Menlo')
    await expect.poll(() => readState(dir)?.editorTheme).toBe('Dracula')

    await app.close()
    ;({ app, win } = await launchApp(dir))
    const panel2 = (await openSettingsTab(win, 'Appearance')).locator('.settings-panel:visible')
    await expect(panel2.locator('.field', { hasText: 'Terminal font size' }).locator('input')).toHaveValue('20')
    await expect(panel2.locator('.field', { hasText: 'Code editor theme' }).locator('select')).toHaveValue('Dracula')
  } finally {
    await closeApp(app, dir)
  }
})

test('settings-fields: Tabs display mode + per-tab hide apply live and persist', async () => {
  const dir = freshStateDir('crafterm-e2e-sf-')
  const { app, win } = await launchApp(dir)
  try {
    const panel = (await openSettingsTab(win, 'Tabs')).locator('.settings-panel:visible')

    await panel.locator('.field', { hasText: 'Display' }).locator('select').selectOption({ value: 'both' })
    await expect(win.locator('#sidebar-tabs')).toHaveClass(/tabs-mode-both/, { timeout: 5_000 }) // live
    await expect.poll(() => readState(dir)?.tabDisplay?.mode, { timeout: 5_000 }).toBe('both')

    await panel.locator('label', { hasText: 'Docker' }).locator('input[type=checkbox]').uncheck()
    await expect(win.locator('#tab-docker')).toBeHidden() // live: display:none
    await expect
      .poll(() => (readState(dir)?.tabDisplay?.hidden?.left ?? []).includes('tab-docker'), { timeout: 5_000 })
      .toBe(true)
  } finally {
    await closeApp(app, dir)
  }
})

test('settings-fields: the save-status chip flips to Saved after an edit', async () => {
  const dir = freshStateDir('crafterm-e2e-sf-')
  const { app, win } = await launchApp(dir)
  try {
    const panel = (await openSettingsTab(win, 'Appearance')).locator('.settings-panel:visible')
    await panel.locator('.field', { hasText: 'Terminal font size' }).locator('input').fill('18')
    await win.keyboard.press('Tab')
    await expect(win.locator('.settings-save-chip')).toHaveAttribute('data-state', 'saved', { timeout: 5_000 })
    await expect(win.locator('.settings-save-chip')).toContainText('Saved')
  } finally {
    await closeApp(app, dir)
  }
})

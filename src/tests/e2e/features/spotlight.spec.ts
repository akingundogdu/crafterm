import { test, expect, type Page } from '@playwright/test'
import { freshStateDir, launchApp, openTerminal, closeApp } from '../_harness.js'

// Spotlight (Cmd+P) palette (§4): open, Tab/Shift+Tab tab cycling, deterministic
// tab population (Terminals from the starter pane, Shortcuts from KEYBINDINGS),
// Enter runs the selected result, Esc closes. HR-5: throwaway state dir only.

// Cmd+P can miss the very first keypress if the window hasn't taken focus yet;
// retry until the modal opens (a 2nd Cmd+P is a no-op once the modal is active).
async function openSpotlight(win: Page): Promise<void> {
  await expect(async () => {
    await win.keyboard.press('Meta+p')
    await expect(win.locator('.spotlight-modal')).toBeVisible({ timeout: 2500 })
  }).toPass({ timeout: 20_000 })
}

test('spotlight: Cmd+P opens; Tab cycles tabs; tabs populate; Esc closes', async () => {
  const dir = freshStateDir('crafterm-e2e-spot-')
  const { app, win } = await launchApp(dir)
  try {
    await openTerminal(win) // a terminal must be registered for the Terminals tab
    await openSpotlight(win)
    await expect(win.locator('.spot-tab.active .spot-tab-name')).toHaveText('All')

    await test.step('Tab / Shift+Tab cycle the tab strip', async () => {
      // The spotlight keydown is bound to the input (spotlight.ts) and focus is
      // applied via setTimeout(focus,0). locator.press is atomic — actionability
      // wait -> focus -> key in one step — so the keystroke always lands on the
      // focused input, with no focus/press race that full-suite load can lose.
      const search = win.locator('input.search-box-input')
      await search.press('Tab')
      await expect(win.locator('.spot-tab.active .spot-tab-name')).toHaveText('Files')
      await search.press('Shift+Tab')
      await expect(win.locator('.spot-tab.active .spot-tab-name')).toHaveText('All')
    })

    await test.step('Terminals tab lists the open pane', async () => {
      await win.locator('button.spot-tab', { hasText: 'Terminals' }).click()
      await expect(win.locator('.spot-list .spot-row').first()).toBeVisible({ timeout: 8_000 })
    })

    await test.step('Shortcuts tab is populated + content-assertable', async () => {
      await win.locator('button.spot-tab', { hasText: 'Shortcuts' }).click()
      await expect(win.locator('.spot-list .spot-row', { hasText: 'Spotlight (unified search)' })).toBeVisible({ timeout: 8_000 })
    })

    await test.step('Esc closes', async () => {
      // tab clicks moved focus to the tab buttons; press() re-focuses the input
      // (Esc is handled by the input's keydown) and dispatches atomically.
      await win.locator('input.search-box-input').press('Escape')
      await expect(win.locator('.modal-overlay')).toHaveCount(0)
    })
  } finally {
    await closeApp(app, dir)
  }
})

test('spotlight: Enter runs the selected shortcut (toggle sidebar) and closes', async () => {
  const dir = freshStateDir('crafterm-e2e-spot-')
  const { app, win } = await launchApp(dir)
  try {
    await expect(win.locator('#app')).not.toHaveClass(/sidebar-collapsed/)
    await openSpotlight(win)
    await win.locator('button.spot-tab', { hasText: 'Shortcuts' }).click()
    const search = win.locator('input.search-box-input')
    await search.fill('Toggle sidebar')
    await expect(win.locator('.spot-row.active', { hasText: 'Toggle sidebar' })).toBeVisible({ timeout: 8_000 })
    await search.press('Enter') // atomic focus+key; Enter is handled by the input's keydown
    await expect(win.locator('.modal-overlay')).toHaveCount(0)
    await expect(win.locator('#app')).toHaveClass(/sidebar-collapsed/)
  } finally {
    await closeApp(app, dir)
  }
})

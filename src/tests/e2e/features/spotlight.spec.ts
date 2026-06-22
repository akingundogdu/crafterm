import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// Spotlight (Cmd+P) palette (§4): open, Tab/Shift+Tab tab cycling, deterministic
// tab population (Terminals from the starter pane, Shortcuts from KEYBINDINGS),
// Enter runs the selected result, Esc closes. HR-5: throwaway state dir only.

function freshStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-spot-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(dir)) throw new Error('HR-5 violated: refusing real state dir')
  return dir
}
async function launch(dir: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: dir } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}
// Cmd+P can miss the very first keypress if the window hasn't taken focus yet;
// retry until the modal opens (a 2nd Cmd+P is a no-op once the modal is active).
async function openSpotlight(win: Page): Promise<void> {
  await expect(async () => {
    await win.keyboard.press('Meta+p')
    await expect(win.locator('.spotlight-modal')).toBeVisible({ timeout: 2500 })
  }).toPass({ timeout: 20_000 })
}

test('spotlight: Cmd+P opens; Tab cycles tabs; tabs populate; Esc closes', async () => {
  const dir = freshStateDir()
  const { app, win } = await launch(dir)
  try {
    await openSpotlight(win)
    await expect(win.locator('.spot-tab.active .spot-tab-name')).toHaveText('All')

    await test.step('Tab / Shift+Tab cycle the tab strip', async () => {
      await win.locator('input.search-box-input').focus() // Tab is handled by the input's keydown
      await win.keyboard.press('Tab')
      await expect(win.locator('.spot-tab.active .spot-tab-name')).toHaveText('Files')
      await win.keyboard.press('Shift+Tab')
      await expect(win.locator('.spot-tab.active .spot-tab-name')).toHaveText('All')
    })

    await test.step('Terminals tab lists the open pane', async () => {
      await win.locator('button.spot-tab', { hasText: 'Terminals' }).click()
      await expect(win.locator('.spot-list .spot-row').first()).toBeVisible({ timeout: 5_000 })
    })

    await test.step('Shortcuts tab is populated + content-assertable', async () => {
      await win.locator('button.spot-tab', { hasText: 'Shortcuts' }).click()
      await expect(win.locator('.spot-list .spot-row', { hasText: 'Spotlight (unified search)' })).toBeVisible({ timeout: 5_000 })
    })

    await test.step('Esc closes', async () => {
      await win.locator('input.search-box-input').focus() // tab clicks moved focus; Esc is handled by the input
      await win.keyboard.press('Escape')
      await expect(win.locator('.modal-overlay')).toHaveCount(0)
    })
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('spotlight: Enter runs the selected shortcut (toggle sidebar) and closes', async () => {
  const dir = freshStateDir()
  const { app, win } = await launch(dir)
  try {
    await expect(win.locator('#app')).not.toHaveClass(/sidebar-collapsed/)
    await openSpotlight(win)
    await win.locator('button.spot-tab', { hasText: 'Shortcuts' }).click()
    await win.locator('input.search-box-input').fill('Toggle sidebar')
    await expect(win.locator('.spot-row.active', { hasText: 'Toggle sidebar' })).toBeVisible({ timeout: 5_000 })
    await win.keyboard.press('Enter')
    await expect(win.locator('.modal-overlay')).toHaveCount(0)
    await expect(win.locator('#app')).toHaveClass(/sidebar-collapsed/)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

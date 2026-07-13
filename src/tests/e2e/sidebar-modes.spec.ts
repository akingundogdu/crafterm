import { test, expect, type Page } from '@playwright/test'
import { freshStateDir, launchApp, readState, closeApp } from './_harness.js'

// Left sidebar (§3): mode switching, the shared search filter, and collapse —
// none of which sidebar-hierarchy.spec touches. The active MODE is intentionally
// NOT persisted (the app always opens in Terminal: #tab-terminal ships active),
// so mode switching is asserted live and only `collapsed` is checked across a
// relaunch. HR-5: throwaway state dir only. Harness inlined per the repo's
// self-contained-spec convention.

async function fillModal(win: Page, fills: string[], submit: string): Promise<void> {
  const modal = win.locator('.modal-overlay')
  await expect(modal).toBeVisible()
  const inputs = modal.locator('input[type="text"]')
  for (let i = 0; i < fills.length; i++) await inputs.nth(i).fill(fills[i])
  await modal.getByRole('button', { name: submit }).click()
}

const PROJECT = `E2E SearchTarget ${Date.now()}`

test('sidebar: switch modes, filter with search, toggle + persist collapse', async () => {
  const dir = freshStateDir('crafterm-e2e-sb-')
  let { app, win } = await launchApp(dir)
  try {
    const appEl = win.locator('#app')

    await test.step('mode tabs switch content + active state', async () => {
      await win.locator('#tab-notebook').click()
      await expect(appEl).toHaveClass(/mode-notebook/)
      await expect(win.locator('#tab-notebook')).toHaveClass(/active/)
      await win.locator('#tab-database').click()
      await expect(appEl).toHaveClass(/mode-database/)
      await win.locator('#tab-terminal').click()
      await expect(appEl).not.toHaveClass(/mode-(notebook|database|docker|accounts)/)
      await expect(win.locator('#tab-terminal')).toHaveClass(/active/)
    })

    await test.step('Cmd+2 / Cmd+1 are mode shortcuts', async () => {
      await win.keyboard.press('Meta+2')
      await expect(appEl).toHaveClass(/mode-notebook/)
      await win.keyboard.press('Meta+1')
      await expect(appEl).not.toHaveClass(/mode-notebook/)
    })

    await test.step('search filters the tree; Esc clears', async () => {
      await win.locator('#new-project').click()
      await fillModal(win, [PROJECT, '/tmp/e2e-sidebar-modes'], 'Create')
      await expect(win.locator('.modal-overlay')).toBeHidden()
      await expect(win.locator('#tab-list')).toContainText(PROJECT)

      await win.locator('#search-input').fill('SearchTarget')
      await expect(win.locator('#tab-list')).toContainText(PROJECT)
      await win.locator('#search-input').fill('zz-no-such-node-zz')
      await expect(win.locator('#tab-list')).not.toContainText(PROJECT)
      await win.locator('#search-input').press('Escape')
      await expect(win.locator('#tab-list')).toContainText(PROJECT)
    })

    await test.step('Cmd+B toggles collapse', async () => {
      await expect(appEl).not.toHaveClass(/sidebar-collapsed/)
      await win.keyboard.press('Meta+b')
      await expect(appEl).toHaveClass(/sidebar-collapsed/)
      await win.keyboard.press('Meta+b')
      await expect(appEl).not.toHaveClass(/sidebar-collapsed/)
      await win.keyboard.press('Meta+b') // leave collapsed for the persistence check
      await expect(appEl).toHaveClass(/sidebar-collapsed/)
    })

    await test.step('collapse persists across relaunch', async () => {
      await expect
        .poll(() => readState(dir)?.sidebar?.collapsed === true, { timeout: 5_000 })
        .toBe(true)
      await app.close()
      ;({ app, win } = await launchApp(dir))
      await expect(win.locator('#app')).toHaveClass(/sidebar-collapsed/)
    })
  } finally {
    await closeApp(app, dir)
  }
})

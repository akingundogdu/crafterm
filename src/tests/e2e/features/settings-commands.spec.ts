import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { freshStateDir, launchApp, readState, closeApp } from '../_harness.js'

// Settings modal — palette commands + action-menu items, through the real UI.
// Palette writes via paletteCommandRepo, action items via actionMenuRepo; both
// persist. Add each, assert it renders in its panel + on disk, and restores on
// relaunch.

async function waitForState(dir: string, pred: (st: Record<string, any>) => boolean): Promise<void> {
  await expect.poll(() => { const st = readState(dir); return !!st && pred(st) }, { timeout: 5_000 }).toBe(true)
}
async function openSettings(win: Page): Promise<void> {
  await win.locator('#settings-btn').click()
  await expect(win.locator('.modal.settings-modal')).toBeVisible()
}
async function settingsNav(win: Page, label: string): Promise<void> {
  await win.locator('.settings-nav .settings-nav-item', { hasText: label }).click()
}
// The currently-shown settings category panel.
function activePanel(win: Page) {
  return win.locator('.settings-panel:visible')
}

const PAL = `e2e-pal-${Date.now()}`
const ACT = `e2e-act-${Date.now()}`

test('settings: add a palette command and an action-menu item; restore on relaunch', async () => {
  const dir = freshStateDir()

  let app: ElectronApplication | null = null
  try {
    const s = await launchApp(dir)
    app = s.app
    const win = s.win
    await openSettings(win)

    await test.step('add a palette command (Commands → Command palette)', async () => {
      await settingsNav(win, 'Commands')
      await win.locator('.settings-subtab', { hasText: 'Command palette' }).click()
      await activePanel(win).getByRole('button', { name: '+ Add command' }).click()
      const form = win.locator('.modal-overlay').last()
      const inputs = form.locator('input[type="text"]')
      await inputs.nth(0).fill('e2e') // category
      await inputs.nth(1).fill(PAL) // name
      await inputs.nth(2).fill('echo e2e') // command
      await form.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(activePanel(win)).toContainText(PAL)
      await waitForState(dir, (st) => (st.paletteCommands ?? []).some((c: any) => c.name === PAL))
    })

    await test.step('add an action-menu item (Action menu → + Add command)', async () => {
      await settingsNav(win, 'Action menu')
      await activePanel(win).getByRole('button', { name: '+ Add command' }).click()
      const form = win.locator('.modal-overlay').last()
      const inputs = form.locator('input[type="text"]')
      await inputs.nth(0).fill(ACT) // title
      await inputs.nth(1).fill('echo act') // command
      await form.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(activePanel(win)).toContainText(ACT)
      await waitForState(dir, (st) => (st.actionMenu ?? []).some((a: any) => a.title === ACT))
    })
  } finally {
    if (app) await app.close()
  }

  let app2: ElectronApplication | null = null
  try {
    const s2 = await launchApp(dir)
    app2 = s2.app
    const win = s2.win
    await openSettings(win)
    await settingsNav(win, 'Commands')
    await win.locator('.settings-subtab', { hasText: 'Command palette' }).click()
    await expect(activePanel(win)).toContainText(PAL)
    await settingsNav(win, 'Action menu')
    await expect(activePanel(win)).toContainText(ACT)
  } finally {
    await closeApp(app2, dir)
  }
})

import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Settings modal — palette commands + action-menu items, through the real UI.
// Palette writes via paletteCommandRepo, action items via actionMenuRepo; both
// persist. Add each, assert it renders in its panel + on disk, and restores on
// relaunch.

function freshDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'crafterm-e2e-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(d)) throw new Error('HR-5 violated: refusing real state dir')
  return d
}
function readState(dir: string): Record<string, any> | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'crafterm-state.json'), 'utf8'))
  } catch {
    return null
  }
}
async function launch(dir: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_STATE_DIR: dir } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}
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
  const dir = freshDir()

  let app: ElectronApplication | null = null
  try {
    const s = await launch(dir)
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
    const s2 = await launch(dir)
    app2 = s2.app
    const win = s2.win
    await openSettings(win)
    await settingsNav(win, 'Commands')
    await win.locator('.settings-subtab', { hasText: 'Command palette' }).click()
    await expect(activePanel(win)).toContainText(PAL)
    await settingsNav(win, 'Action menu')
    await expect(activePanel(win)).toContainText(ACT)
  } finally {
    if (app2) await app2.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

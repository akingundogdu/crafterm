import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Settings deepen (§5): theme switch + persist, ANSI grid editable only on Custom,
// the keybinding recorder, and that seeded palette/action commands surface in
// Spotlight + the sidebar ⋯ menu. HR-5: throwaway state dir only.

function freshStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-set-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(dir)) throw new Error('HR-5 violated: refusing real state dir')
  return dir
}
function readState(dir: string): Record<string, any> | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'crafterm-state.json'), 'utf8'))
  } catch {
    return null
  }
}
async function launch(dir: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: dir } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}
async function openSettingsTab(win: Page, navText: string): Promise<ReturnType<Page['locator']>> {
  await win.locator('#settings-btn').click()
  const modal = win.locator('.modal.settings-modal')
  await expect(modal).toBeVisible({ timeout: 10_000 })
  await modal.locator('.settings-nav-item', { hasText: navText }).click()
  return modal
}

test('settings: theme switch persists + ANSI grid is editable only on Custom', async () => {
  const dir = freshStateDir()
  let { app, win } = await launch(dir)
  try {
    let modal = await openSettingsTab(win, 'Theme')
    const select = () => win.locator('.modal.settings-modal .settings-panel:visible select')
    const grid = modal.locator('.settings-panel:visible .color-grid')

    await test.step('built-in theme locks the ANSI grid + persists `theme`', async () => {
      await select().selectOption({ label: 'Dracula' })
      await expect(grid).toHaveCSS('pointer-events', 'none')
      await expect.poll(() => readState(dir)?.theme === 'Dracula', { timeout: 5_000 }).toBe(true)
    })

    await test.step('Custom unlocks the 22-row ANSI grid', async () => {
      await select().selectOption({ label: 'Custom' })
      await expect(grid).toHaveCSS('pointer-events', 'auto')
      await expect(grid.locator('.color-row')).toHaveCount(22)
    })

    await test.step('theme restores on relaunch', async () => {
      await select().selectOption({ label: 'Dracula' })
      await expect.poll(() => readState(dir)?.theme === 'Dracula', { timeout: 5_000 }).toBe(true)
      await app.close()
      ;({ app, win } = await launch(dir))
      await openSettingsTab(win, 'Theme')
      await expect(win.locator('.modal.settings-modal .settings-panel:visible select')).toHaveValue('Dracula')
    })
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('settings: the keybinding recorder records a new combo', async () => {
  const dir = freshStateDir()
  const { app, win } = await launch(dir)
  try {
    const modal = await openSettingsTab(win, 'Shortcuts')
    const row = modal.locator('.shortcut-row', { hasText: 'New terminal' }).first()
    await row.locator('.shortcut-combo').click()
    await expect(row.locator('.shortcut-combo')).toHaveText(/Press keys/)
    await win.keyboard.press('Meta+g') // cmd+g — not a default combo
    await expect.poll(() => readState(dir)?.bindings?.['new-terminal'] === 'cmd+g', { timeout: 5_000 }).toBe(true)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('settings: seeded palette command shows in Spotlight + action item in the ⋯ menu', async () => {
  const dir = freshStateDir()
  const PAL = `E2E Palette ${Date.now()}`
  const ACT = `E2E Action ${Date.now()}`
  writeFileSync(
    join(dir, 'crafterm-state.json'),
    JSON.stringify({
      theme: 'GitHub Dark',
      paletteCommands: [{ id: 'e2e-pal-1', category: 'e2e', name: PAL, command: 'echo e2e' }],
      actionMenu: [{ id: 'e2e-act-1', title: ACT, kind: 'command', command: 'echo act', opensAs: 'split', hidden: false }]
    })
  )
  const { app, win } = await launch(dir)
  try {
    await test.step('palette command in Spotlight → Commands tab', async () => {
      await expect(async () => {
        await win.keyboard.press('Meta+p')
        await expect(win.locator('.spotlight-modal')).toBeVisible({ timeout: 1500 })
      }).toPass({ timeout: 15_000 })
      await win.locator('.spot-tab', { hasText: 'Commands' }).click()
      await win.locator('.search-box-input').fill('E2E Palette')
      await expect(win.locator('.spot-list .spotlight-label', { hasText: PAL })).toBeVisible({ timeout: 8_000 })
      await win.keyboard.press('Escape')
      await expect(win.locator('.modal-overlay')).toHaveCount(0)
    })

    await test.step('action item in the sidebar ⋯ menu', async () => {
      await win.locator('#sidebar-actions').click()
      await expect(win.locator('.context-menu button', { hasText: ACT })).toBeVisible()
    })
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

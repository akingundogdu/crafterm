import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Left sidebar (§3) preferences: orientation + font through Settings, size via
// the resizer drag, and the Cmd+=/Cmd+0 font keys — each asserted live and
// (where persisted) across a relaunch. HR-5: throwaway state dir only.

function freshStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-prefs-'))
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
function inlineStyle(win: Page, sel: string, prop: 'width' | 'height' | 'fontSize'): Promise<string> {
  return win.locator(sel).evaluate((el, p) => (el as HTMLElement).style[p as any], prop)
}

test('sidebar prefs: orientation + font via Settings persist across relaunch', async () => {
  const dir = freshStateDir()
  let { app, win } = await launch(dir)
  try {
    await win.locator('#settings-btn').click()
    const modal = win.locator('.modal.settings-modal')
    await expect(modal).toBeVisible()
    await modal.locator('.settings-nav-item', { hasText: 'Sidebar' }).click()
    const panel = modal.locator('.settings-panel').filter({ hasText: 'Sidebar font size' })

    await test.step('Position select → top flips orientation + persists', async () => {
      await panel.locator('.field:has(label:has-text("Position")) select').selectOption('top')
      await expect(win.locator('#app')).toHaveClass(/orient-top/)
    })

    await test.step('Font input → 16 applies + persists', async () => {
      const input = panel.locator('.field:has(label:has-text("Sidebar font size")) input[type="number"]')
      await input.fill('16')
      await input.dispatchEvent('change')
      await expect(win.locator('#sidebar')).toHaveCSS('font-size', '16px')
    })

    await expect
      .poll(() => readState(dir)?.sidebar?.orientation === 'top' && readState(dir)?.sidebar?.fontSize === 16, { timeout: 5_000 })
      .toBe(true)

    await test.step('both restore on relaunch', async () => {
      await app.close()
      ;({ app, win } = await launch(dir))
      await expect(win.locator('#app')).toHaveClass(/orient-top/)
      await expect(win.locator('#sidebar')).toHaveCSS('font-size', '16px')
    })
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('sidebar prefs: resizer drag changes + persists sidebar size', async () => {
  const dir = freshStateDir()
  let { app, win } = await launch(dir)
  try {
    const resizer = win.locator('#sidebar-resizer')
    const box = await resizer.boundingBox()
    if (!box) throw new Error('no #sidebar-resizer bounding box')
    await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await win.mouse.down()
    await win.mouse.move(box.x + 90, box.y + box.height / 2, { steps: 8 })
    await win.mouse.up()

    await expect
      .poll(() => {
        const s = readState(dir)?.sidebar?.size
        return typeof s === 'number' && s !== 230 && s >= 120 && s <= 600
      }, { timeout: 5_000 })
      .toBe(true)
    const newSize = readState(dir)?.sidebar?.size as number

    await app.close()
    ;({ app, win } = await launch(dir))
    await expect.poll(() => readState(dir)?.sidebar?.size, { timeout: 5_000 }).toBe(newSize)
    expect(await inlineStyle(win, '#sidebar', 'width')).toBe(`${newSize}px`)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('sidebar prefs: Cmd+= / Cmd+0 adjust + reset font when the sidebar has focus', async () => {
  const dir = freshStateDir()
  const { app, win } = await launch(dir)
  try {
    await win.locator('#tab-list').focus() // sidebarHasFocus() => #sidebar contains activeElement
    await expect(win.locator('#sidebar')).toHaveCSS('font-size', '13px') // default
    await win.keyboard.press('Meta+=')
    await expect(win.locator('#sidebar')).toHaveCSS('font-size', '14px')
    await win.keyboard.press('Meta+0')
    await expect(win.locator('#sidebar')).toHaveCSS('font-size', '13px')
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

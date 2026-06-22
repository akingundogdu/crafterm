import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Live terminal-pane interactions (§2.37/§2.41–44): per-pane font zoom (Cmd+=/-/0,
// active pane only) and pane drag-to-rearrange (pointer-event grip drag → movePane
// restructures the layout). HR-5: throwaway state dir only.

function freshStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-pint-'))
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
function splitTab(dir: string): any {
  const walk = (nodes: any[]): any[] => (nodes ?? []).flatMap((n) => (n.kind === 'tab' ? [n] : walk(n.children)))
  return walk(readState(dir)?.tree ?? []).find((t) => t.root?.type === 'split')
}
async function launch(dir: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: dir } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}

test('pane: Cmd+= / Cmd+0 zoom the active pane font only (per-pane)', async () => {
  const dir = freshStateDir()
  const { app, win } = await launch(dir)
  try {
    await expect(win.locator('.pane-box')).toHaveCount(1)
    await win.keyboard.press('Meta+d') // split → 2 panes, to prove "active pane only"
    await expect(win.locator('.pane-box')).toHaveCount(2)
    const boxes = win.locator('.pane-box')
    await boxes.nth(0).locator('.pane-term').click() // focus the terminal (not the sidebar) so zoom routes to the pane

    const rows0 = boxes.nth(0).locator('.xterm-rows')
    const rows1 = boxes.nth(1).locator('.xterm-rows')
    // xterm injects the font-size via a <style> rule, not inline — read the computed value.
    const base = Math.round(parseFloat(await rows0.evaluate((el) => getComputedStyle(el).fontSize)))

    await win.keyboard.press('Meta+=')
    await win.keyboard.press('Meta+=')
    await expect(rows0).toHaveCSS('font-size', `${base + 2}px`) // active grew (+1px per press)
    await expect(rows1).toHaveCSS('font-size', `${base}px`) // the inactive pane is untouched

    await win.keyboard.press('Meta+0')
    await expect(rows0).toHaveCSS('font-size', `${base}px`) // reset clears the per-pane override
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('pane: dragging the pane grip onto another pane rearranges the layout (row → col)', async () => {
  const dir = freshStateDir()
  const { app, win } = await launch(dir)
  try {
    await expect(win.locator('.pane-box')).toHaveCount(1)
    await win.keyboard.press('Meta+d') // flat row split
    await expect(win.locator('.pane-box')).toHaveCount(2)
    await expect.poll(() => splitTab(dir)?.root?.dir, { timeout: 5_000 }).toBe('row')

    // The pane drag binds capture-phase mousemove/up to document inside mousedown;
    // Playwright's mouse.* doesn't reach those, so dispatch the exact MouseEvent
    // sequence directly (the house drag, NOT HTML5 DnD). Drop pane 0 onto pane 1's
    // bottom zone → nests a col split.
    const result = await win.evaluate(async () => {
      const boxes = Array.from(document.querySelectorAll('#content .pane-box[data-pane-id]')) as HTMLElement[]
      const h0 = boxes[0].querySelector('.pane-header') as HTMLElement
      const hr = h0.getBoundingClientRect()
      const r1 = boxes[1].getBoundingClientRect()
      const startX = Math.round(hr.left + 40)
      const startY = Math.round(hr.top + hr.height / 2)
      const dropX = Math.round(r1.left + r1.width * 0.5)
      const dropY = Math.round(r1.top + r1.height * 0.85) // bottom zone
      const fire = (type: string, x: number, y: number, t: EventTarget): void => {
        t.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, view: window }))
      }
      fire('mousedown', startX, startY, h0)
      fire('mousemove', startX + 20, startY + 20, document) // clear the 5px threshold
      fire('mousemove', dropX, dropY, document) // hover the target's bottom zone
      await new Promise((r) => setTimeout(r, 50))
      const zone = (boxes[1].querySelector('.pane-drop') as HTMLElement | null)?.dataset.zone
      fire('mouseup', dropX, dropY, document)
      return { zone }
    })

    expect(result.zone).toBe('bottom') // dropZoneAt math
    await expect.poll(() => splitTab(dir)?.root?.dir, { timeout: 5_000 }).toBe('col') // restructured row → col
    await expect(win.locator('.pane-box')).toHaveCount(2) // only the structure changed, not the count
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

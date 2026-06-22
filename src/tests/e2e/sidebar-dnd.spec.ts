import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Left sidebar (§3) drag-and-drop: HTML5 DnD reorder (before/after) and nest
// (into a container), asserted on the on-disk `tree`. The footer #new-project
// button always creates at ROOT, so two clicks yield two siblings to drag.
// HR-5: throwaway state dir only.

function freshStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-dnd-'))
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
async function fillModal(win: Page, fills: string[], submit: string): Promise<void> {
  const modal = win.locator('.modal-overlay')
  await expect(modal).toBeVisible()
  const inputs = modal.locator('input[type="text"]')
  for (let i = 0; i < fills.length; i++) await inputs.nth(i).fill(fills[i])
  await modal.getByRole('button', { name: submit }).click()
}
function rootNames(dir: string, a: string, b: string): string[] {
  return (readState(dir)?.tree ?? []).map((n: any) => n.name).filter((n: string) => n === a || n === b)
}

const P1 = `E2E DnD One ${Date.now()}`
const P2 = `E2E DnD Two ${Date.now()}`

test('sidebar: drag to reorder and nest, persisted to tree', async () => {
  const dir = freshStateDir()
  const { app, win } = await launch(dir)
  try {
    await test.step('create two root sibling projects', async () => {
      await win.locator('#new-project').click()
      await fillModal(win, [P1, '/tmp/e2e-dnd-1'], 'Create')
      await expect(win.locator('.modal-overlay')).toBeHidden()
      await win.locator('#new-project').click()
      await fillModal(win, [P2, '/tmp/e2e-dnd-2'], 'Create')
      await expect(win.locator('.modal-overlay')).toBeHidden()
      await expect(win.locator('#tab-list')).toContainText(P1)
      await expect(win.locator('#tab-list')).toContainText(P2)
      await expect.poll(() => rootNames(dir, P1, P2)).toEqual([P1, P2])
    })

    await test.step('drag P2 above P1 reorders the root', async () => {
      const rowP1 = win.locator('.tab-item', { hasText: P1 }).first()
      const rowP2 = win.locator('.tab-item', { hasText: P2 }).first()
      // drop on the top third of P1 -> 'before'
      await rowP2.dragTo(rowP1, { targetPosition: { x: 30, y: 3 } })
      await expect.poll(() => rootNames(dir, P1, P2), { timeout: 5_000 }).toEqual([P2, P1])
    })

    await test.step('drag P1 into P2 nests it', async () => {
      const rowP1 = win.locator('.tab-item', { hasText: P1 }).first()
      const rowP2 = win.locator('.tab-item', { hasText: P2 }).first()
      // drop on the middle of the container -> 'into'
      await rowP1.dragTo(rowP2)
      await expect
        .poll(() => {
          const t = readState(dir)?.tree ?? []
          const p2 = t.find((n: any) => n.name === P2)
          const rootHasP1 = t.some((n: any) => n.name === P1)
          const nested = (p2?.children ?? []).some((n: any) => n.name === P1)
          return nested && !rootHasP1
        }, { timeout: 5_000 })
        .toBe(true)
    })
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

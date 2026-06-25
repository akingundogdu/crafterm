import { test, expect, type Page } from '@playwright/test'
import { freshStateDir, launchApp, readState, closeApp } from './_harness.js'

// Left sidebar (§3) drag-and-drop: HTML5 DnD reorder (before/after) and nest
// (into a container), asserted on the on-disk `tree`. The footer #new-project
// button always creates at ROOT, so two clicks yield two siblings to drag.
// HR-5: throwaway state dir only.

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
  const dir = freshStateDir('crafterm-e2e-dnd-')
  const { app, win } = await launchApp(dir)
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
    await closeApp(app, dir)
  }
})

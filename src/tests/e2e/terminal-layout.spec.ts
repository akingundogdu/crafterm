import { test, expect } from '@playwright/test'
import { freshStateDir, launchApp, readState, closeApp } from './_harness.js'

// Terminal split layout (§2): nested splits build the LayoutNode tree, the active
// highlight follows the focused pane, and the resizer drag changes the split
// ratio (persisted). Live-layout behaviors that session-persistence.spec (which
// covers split round-trip) doesn't. HR-5: throwaway state dir only.

function splitTab(dir: string): any {
  const walk = (nodes: any[]): any[] =>
    (nodes ?? []).flatMap((n) => (n.kind === 'tab' ? [n] : walk(n.children)))
  return walk(readState(dir)?.tree ?? []).find((t) => t.root?.type === 'split')
}

test('terminal: nested splits build the tree; active highlight follows focus', async () => {
  const dir = freshStateDir('crafterm-e2e-lay-')
  const { app, win } = await launchApp(dir)
  try {
    await expect(win.locator('.pane-box')).toHaveCount(1) // starter
    await win.keyboard.press('Meta+d') // split row -> 2
    await expect(win.locator('.pane-box')).toHaveCount(2)

    await test.step('split a pane again to nest', async () => {
      await win.locator('.pane-box').first().click()
      await win.keyboard.press('Meta+d')
      await expect(win.locator('.pane-box')).toHaveCount(3)
      await expect
        .poll(() => {
          const tab = splitTab(dir)
          return !!tab && (tab.root.children ?? []).some((c: any) => c.type === 'split')
        }, { timeout: 5_000 })
        .toBe(true)
    })

    await test.step('exactly one pane is active and it follows clicks', async () => {
      const boxes = win.locator('.pane-box')
      await expect(win.locator('.pane-box.active')).toHaveCount(1)
      await boxes.nth(0).click()
      await expect(boxes.nth(0)).toHaveClass(/active/)
      await boxes.nth(2).click()
      await expect(boxes.nth(2)).toHaveClass(/active/)
      await expect(boxes.nth(0)).not.toHaveClass(/active/)
      await expect(win.locator('.pane-box.active')).toHaveCount(1)
    })
  } finally {
    await closeApp(app, dir)
  }
})

test('terminal: resizer drag changes the split ratio (persisted)', async () => {
  const dir = freshStateDir('crafterm-e2e-lay-')
  const { app, win } = await launchApp(dir)
  try {
    await expect(win.locator('.pane-box')).toHaveCount(1)
    await win.keyboard.press('Meta+d')
    await expect(win.locator('.pane-box')).toHaveCount(2)

    const resizer = win.locator('.resizer.row').first()
    const box = await resizer.boundingBox()
    if (!box) throw new Error('no .resizer.row bounding box')
    await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await win.mouse.down()
    await win.mouse.move(box.x + 120, box.y + box.height / 2, { steps: 8 })
    await win.mouse.up()

    await expect
      .poll(() => {
        const sizes = splitTab(dir)?.root?.sizes
        return Array.isArray(sizes) && sizes.length === 2 && Math.abs(sizes[0] - 0.5) > 0.02
      }, { timeout: 5_000 })
      .toBe(true)
  } finally {
    await closeApp(app, dir)
  }
})

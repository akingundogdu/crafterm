import { test, expect } from '@playwright/test'
import { freshStateDir, launchApp, openTerminal, selectTab, readState, closeApp } from './_harness.js'

// Terminal-session persistence (§2 + §9): a tab's pane LAYOUT serializes onto the
// tab node as `root` (split/leaf tree). We create a split, set a per-pane bg +
// rename, and assert the split structure + leaf props round-trip across a
// relaunch — the layout-serialization gap persistence.spec doesn't cover. Then
// the archive lifecycle: close → archived + hidden → show-archived → restore.
// HR-5: throwaway state dir only.

function collectLeaves(node: any): any[] {
  if (!node) return []
  if (node.type === 'leaf') return [node]
  return (node.children ?? []).flatMap(collectLeaves)
}
function tabs(dir: string): any[] {
  const walk = (nodes: any[]): any[] =>
    (nodes ?? []).flatMap((n) => (n.kind === 'tab' ? [n] : walk(n.children)))
  return walk(readState(dir)?.tree ?? [])
}

test('session: split layout + per-pane bg + rename restore on relaunch', async () => {
  const dir = freshStateDir('crafterm-e2e-sess-')
  let { app, win } = await launchApp(dir)
  const RENAMED = 'My Split Pane'
  try {
    await test.step('open a terminal and split it', async () => {
      await openTerminal(win)
      await win.keyboard.press('Meta+d') // split-right
      await expect(win.locator('.pane-box')).toHaveCount(2)
    })

    await test.step('set bg color + rename the active pane', async () => {
      const active = win.locator('.pane-box.active')
      await active.locator('.pane-btn').click()
      // swatch 0 = none/Default; swatch 1 = first color (#2a0f0d)
      await win.locator('.context-menu .context-menu-swatches .context-menu-swatch').nth(1).click()
      await active.locator('.pane-header').dblclick()
      const input = win.locator('.pane-rename')
      await expect(input).toBeVisible()
      await input.fill(RENAMED)
      await input.press('Enter')
    })

    await test.step('layout serializes as a split carrying the leaf props', async () => {
      await expect
        .poll(() => {
          const tab = tabs(dir).find((t) => t.root?.type === 'split')
          if (!tab) return false
          const leaves = collectLeaves(tab.root)
          return (
            tab.root.dir != null &&
            Array.isArray(tab.root.sizes) &&
            tab.root.sizes.length === 2 &&
            leaves.length === 2 &&
            leaves.some((l: any) => l.bgColor === '#2a0f0d') &&
            leaves.some((l: any) => l.title === RENAMED && l.titleLocked === true)
          )
        }, { timeout: 5_000 })
        .toBe(true)
    })

    await test.step('restore on relaunch', async () => {
      await app.close()
      ;({ app, win } = await launchApp(dir))
      await selectTab(win) // launch restores the tab but no longer auto-selects it
      await expect(win.locator('.pane-box')).toHaveCount(2)
      await expect(win.locator('.pane-title', { hasText: RENAMED })).toBeVisible()
      expect(tabs(dir).some((t) => t.root?.type === 'split')).toBe(true)
    })
  } finally {
    await closeApp(app, dir)
  }
})

test('session: close archives, show-archived reveals, restore rebuilds', async () => {
  const dir = freshStateDir('crafterm-e2e-sess-')
  const { app, win } = await launchApp(dir)
  try {
    await test.step('create two sessions', async () => {
      await openTerminal(win)
      await expect(win.locator('#tab-list .tab-item')).toHaveCount(1)
      await win.locator('#new-tab').click()
      await expect(win.locator('#tab-list .tab-item')).toHaveCount(2)
      await expect(win.locator('.pane-box')).toHaveCount(2)
    })

    await test.step('close the active session → archived + hidden', async () => {
      await win.locator('.pane-box.active .pane-close').click()
      await expect(win.locator('#tab-list .tab-item')).toHaveCount(1)
      await expect.poll(() => tabs(dir).some((t) => t.status === 'archived'), { timeout: 5_000 }).toBe(true)
    })

    let archivedTitle = ''
    await test.step('show archived reveals it', async () => {
      archivedTitle = tabs(dir).find((t) => t.status === 'archived')?.title ?? ''
      expect(archivedTitle).toBeTruthy()
      await win.locator('#tab-list .tab-item').first().click({ button: 'right' })
      await win.locator('.context-menu').getByRole('button', { name: 'Show archived items', exact: true }).click()
      // toggles to an archived-only view — the archived session becomes visible
      await expect(win.locator('#tab-list .tab-item', { hasText: archivedTitle })).toBeVisible()
    })

    await test.step('restore the archived session rebuilds it', async () => {
      const row = win.locator('#tab-list .tab-item', { hasText: archivedTitle }).first()
      await row.click({ button: 'right' })
      await win.locator('.context-menu').getByRole('button', { name: 'Restore session', exact: true }).click()
      await expect
        .poll(() => tabs(dir).find((t) => t.title === archivedTitle)?.status !== 'archived', { timeout: 5_000 })
        .toBe(true)
    })
  } finally {
    await closeApp(app, dir)
  }
})

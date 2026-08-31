import { test, expect, type Page } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { freshStateDir, launchApp, readState, closeApp } from './_harness.js'

// The experimental data-driven gea tree (`components/tree`), behind
// settings.sidebar.newTree. We seed the state file with the flag ON before launch
// so the sidebar mounts the NEW tree, then exercise its rows end-to-end: card
// render + project icon, inline rename (double-click → .crtree-rename), and the
// per-node context menu pin/unpin — mirroring the legacy sidebar-nodes spec but
// asserting on the `.crtree-*` surface. The legacy path stays covered by that spec.

function seedNewTree(dir: string): void {
  writeFileSync(
    join(dir, 'crafterm-state.json'),
    JSON.stringify({
      sidebar: {
        size: 230,
        orientation: 'left',
        details: { status: true, git: true, panes: true, paneList: false },
        newTree: true
      }
    })
  )
}

async function fillModal(win: Page, fills: string[], submit: string): Promise<void> {
  const modal = win.locator('.modal-overlay')
  await expect(modal).toBeVisible()
  const inputs = modal.locator('input[type="text"]')
  for (let i = 0; i < fills.length; i++) await inputs.nth(i).fill(fills[i])
  await modal.getByRole('button', { name: submit }).click()
}
function findNode(tree: any[] | undefined, name: string): any {
  for (const n of tree ?? []) {
    if (n?.name === name || n?.title === name) return n
    const c = findNode(n?.children, name)
    if (c) return c
  }
  return null
}

const PROJECT = `E2E NewTree Project ${Date.now()}`
const FOLDER = 'E2E NewTree Folder'
const RENAMED = 'E2E NewTree Renamed'

test('sidebar new tree: card render, inline rename, context-menu pin/unpin', async () => {
  const dir = freshStateDir('crafterm-e2e-newtree-')
  seedNewTree(dir)
  const { app, win } = await launchApp(dir)
  try {
    await test.step('the new tree mounts (cards, not legacy .tab-item)', async () => {
      await win.locator('#new-project').click()
      await fillModal(win, [PROJECT, '/tmp/e2e-newtree'], 'Create')
      await expect(win.locator('.modal-overlay')).toBeHidden()
      // NEW tree rows are `.crtree-card`; the legacy `.tab-item` must NOT appear.
      await expect(win.locator('#tab-list .crtree-card', { hasText: PROJECT })).toHaveCount(1)
      await expect(win.locator('#tab-list .tab-item')).toHaveCount(0)
    })

    await test.step('project card is a container with the project icon', async () => {
      const projRow = win.locator('.crtree-card.crtree-folder', { hasText: PROJECT }).first()
      await expect(projRow).toBeVisible()
      await expect(projRow.locator('.crtree-icon-project')).toHaveCount(1)
      await projRow.locator('.crtree-chevron').first().click() // collapse toggles cleanly
      await projRow.locator('.crtree-chevron').first().click()
    })

    await test.step('nested folder via context menu', async () => {
      await win.locator('.crtree-card.crtree-folder', { hasText: PROJECT }).first().click({ button: 'right' })
      await win.locator('.context-menu').getByRole('button', { name: 'New subfolder', exact: true }).click()
      await fillModal(win, [FOLDER], 'Create')
      await expect(win.locator('.modal-overlay')).toBeHidden()
      await expect(win.locator('#tab-list')).toContainText(FOLDER)
    })

    await test.step('double-click inline rename commits to UI + disk', async () => {
      const label = win.locator('.crtree-card', { hasText: FOLDER }).locator('.crtree-label').first()
      await label.dblclick()
      const input = win.locator('.crtree-rename')
      await expect(input).toBeVisible()
      await input.fill(RENAMED)
      await input.press('Enter')
      await expect(win.locator('#tab-list')).toContainText(RENAMED)
      await expect.poll(() => !!findNode(readState(dir)?.tree, RENAMED), { timeout: 5_000 }).toBe(true)
    })

    await test.step('right-click → Pin adds a badge + persists; Unpin removes it', async () => {
      const projRow = win.locator('.crtree-card.crtree-folder', { hasText: PROJECT }).first()
      await projRow.click({ button: 'right' })
      const menu = win.locator('.context-menu')
      await expect(menu).toBeVisible()
      await menu.getByRole('button', { name: 'Pin', exact: true }).click()
      await expect(projRow.locator('.crtree-pin')).toHaveCount(1)
      await expect.poll(() => findNode(readState(dir)?.tree, PROJECT)?.pinned === true, { timeout: 5_000 }).toBe(true)

      await projRow.click({ button: 'right' })
      await expect(menu).toBeVisible()
      await menu.getByRole('button', { name: 'Unpin', exact: true }).click()
      await expect(projRow.locator('.crtree-pin')).toHaveCount(0)
    })
  } finally {
    await closeApp(app, dir)
  }
})

// Regression: the new tree is created lazily inside the first render, which on a
// session restore already has data in the same tick. The list must still paint —
// it renders from a fresh mount per rebuild, not cross-render reactivity.
test('sidebar new tree: rows survive a restart (restore renders)', async () => {
  const dir = freshStateDir('crafterm-e2e-newtree-restore-')
  seedNewTree(dir)
  {
    const { app, win } = await launchApp(dir)
    await win.locator('#new-tab').click()
    await expect(win.locator('.pane-box')).toHaveCount(1, { timeout: 15_000 })
    await expect(win.locator('#tab-list .crtree-card')).not.toHaveCount(0)
    await win.waitForTimeout(800) // let state persist
    await app.close()
  }
  const { app, win } = await launchApp(dir)
  try {
    // A restored terminal must appear as a card (this was the empty-sidebar bug).
    await expect(win.locator('#tab-list .crtree-card')).not.toHaveCount(0)
  } finally {
    await closeApp(app, dir)
  }
})

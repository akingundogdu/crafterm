import { test, expect, type Page } from '@playwright/test'
import { freshStateDir, launchApp, readState, closeApp } from './_harness.js'

// Left sidebar (§3) node behaviors: type-specific row render, inline rename
// (double-click), and the per-node context menu (pin/unpin) — with on-disk
// `tree` assertions, not just rendered text. HR-5: throwaway state dir only.
// Harness inlined per the repo's self-contained-spec convention.

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

const PROJECT = `E2E Nodes Project ${Date.now()}`
const FOLDER = 'E2E Nodes Folder'
const RENAMED = 'E2E Renamed Folder'

test('sidebar: node render, inline rename, context-menu pin/unpin', async () => {
  const dir = freshStateDir('crafterm-e2e-sbn-')
  const { app, win } = await launchApp(dir)
  try {
    await test.step('create a project + nested folder', async () => {
      await win.locator('#new-project').click()
      await fillModal(win, [PROJECT, '/tmp/e2e-sidebar-nodes'], 'Create')
      await expect(win.locator('.modal-overlay')).toBeHidden()
      await expect(win.locator('#tab-list')).toContainText(PROJECT)
      // ⇧⌘N now shows the start screen; nesting goes through the row context menu.
      await win.locator('.tab-item.folder', { hasText: PROJECT }).first().click({ button: 'right' })
      await win.locator('.context-menu').getByRole('button', { name: 'New subfolder', exact: true }).click()
      await fillModal(win, [FOLDER], 'Create')
      await expect(win.locator('.modal-overlay')).toBeHidden()
      await expect(win.locator('#tab-list')).toContainText(FOLDER)
    })

    await test.step('project row renders as a container with the project icon', async () => {
      const projRow = win.locator('.tab-item.folder', { hasText: PROJECT }).first()
      await expect(projRow).toBeVisible()
      await expect(projRow.locator('.project-icon')).toHaveCount(1)
    })

    await test.step('double-click inline rename commits to UI + disk', async () => {
      const title = win.locator('.tab-item', { hasText: FOLDER }).locator('.tab-title').first()
      await title.dblclick()
      const input = win.locator('.rename-input')
      await expect(input).toBeVisible()
      await input.fill(RENAMED)
      await input.press('Enter')
      await expect(win.locator('#tab-list')).toContainText(RENAMED)
      await expect.poll(() => !!findNode(readState(dir)?.tree, RENAMED), { timeout: 5_000 }).toBe(true)
    })

    await test.step('right-click → Pin adds a badge + persists; Unpin removes it', async () => {
      const projRow = win.locator('.tab-item.folder', { hasText: PROJECT }).first()
      await projRow.click({ button: 'right' })
      const menu = win.locator('.context-menu')
      await expect(menu).toBeVisible()
      await menu.getByRole('button', { name: 'Pin', exact: true }).click()
      await expect(projRow.locator('.pin-badge')).toHaveCount(1)
      await expect.poll(() => findNode(readState(dir)?.tree, PROJECT)?.pinned === true, { timeout: 5_000 }).toBe(true)

      await projRow.click({ button: 'right' })
      await expect(menu).toBeVisible()
      await menu.getByRole('button', { name: 'Unpin', exact: true }).click()
      await expect(projRow.locator('.pin-badge')).toHaveCount(0)
    })

    await test.step('right-click → Delete folder removes it (no confirm)', async () => {
      const folderRow = win.locator('.tab-item', { hasText: RENAMED }).first()
      await folderRow.click({ button: 'right' })
      const menu = win.locator('.context-menu')
      await expect(menu).toBeVisible()
      await menu.getByRole('button', { name: 'Delete folder', exact: true }).click()
      await expect(win.locator('#tab-list')).not.toContainText(RENAMED)
      await expect.poll(() => !findNode(readState(dir)?.tree, RENAMED), { timeout: 5_000 }).toBe(true)
    })
  } finally {
    await closeApp(app, dir)
  }
})

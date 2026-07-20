import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { freshStateDir, launchApp, readState, closeApp } from './_harness.js'

// A single real-app session that builds a sidebar hierarchy the way a user would
// — project -> nested folder -> bookmark — entirely through the UI, then verifies
// it persisted (tree nesting on disk) and survives a relaunch. Exercises the live
// create paths + persistence + load round-trip in one flow rather than one app
// per case. HR-5: throwaway state dir only.

const PROJECT = 'E2E Hierarchy'
const FOLDER = 'E2E Sub Folder'
const BOOKMARK = `E2E Bookmark ${Date.now()}`

async function dialogConfirm(win: Page, fills: string[]): Promise<void> {
  const modal = win.locator('.modal-overlay')
  await expect(modal).toBeVisible()
  const inputs = modal.locator('input[type="text"]')
  for (let i = 0; i < fills.length; i++) await inputs.nth(i).fill(fills[i])
  await modal.getByRole('button', { name: 'Create' }).click()
  await expect(modal).toBeHidden()
}

test('build project -> nested folder -> bookmark in one session and restore on relaunch', async () => {
  const dir = freshStateDir('crafterm-e2e-wf-')

  // ---- Session 1: build the hierarchy through the real UI ----
  let app: ElectronApplication | null = null
  try {
    const s = await launchApp(dir)
    app = s.app
    const win = s.win

    await test.step('create a project (root)', async () => {
      await win.locator('#new-project').click()
      await dialogConfirm(win, [PROJECT, '/tmp/e2e-hierarchy']) // name, path
      await expect(win.locator('#tab-list')).toContainText(PROJECT)
    })

    await test.step('nest a folder under the project (context menu → New subfolder)', async () => {
      // ⇧⌘N now shows the start screen; nesting goes through the row context menu.
      await win.locator('.tab-item.folder', { hasText: PROJECT }).first().click({ button: 'right' })
      await win.locator('.context-menu').getByRole('button', { name: 'New subfolder', exact: true }).click()
      await dialogConfirm(win, [FOLDER])
      await expect(win.locator('#tab-list')).toContainText(FOLDER)
    })

    await test.step('add a bookmark', async () => {
      await win.locator('#notif-tab-bm').click()
      await win.getByRole('button', { name: '+ Bookmark' }).click()
      const modal = win.locator('.modal-overlay')
      await expect(modal).toBeVisible()
      await modal.locator('input[type="text"]').first().fill(BOOKMARK)
      await modal.getByRole('button', { name: 'Save' }).click()
      await expect(win.locator('#notif-bm-view')).toContainText(BOOKMARK)
    })

    await test.step('everything reached disk with the right nesting', async () => {
      await expect.poll(() => {
        const cur = readState(dir)
        return !!cur && (cur.bookmarks ?? []).some((b: any) => b.title === BOOKMARK)
      }, { timeout: 5_000 }).toBe(true)

      const st = readState(dir) ?? {}
      const proj = (st.tree ?? []).find((n: any) => n.kind === 'project' && n.name === PROJECT)
      expect(proj, 'project persisted at root').toBeTruthy()
      const folder = (proj.children ?? []).find((n: any) => n.kind === 'folder' && n.name === FOLDER)
      expect(folder, 'folder nested under project').toBeTruthy()
    })
  } finally {
    await closeApp(app)
  }

  // ---- Session 2: relaunch the same dir; the hierarchy is restored ----
  let app2: ElectronApplication | null = null
  try {
    const s2 = await launchApp(dir)
    app2 = s2.app
    await expect(s2.win.locator('#tab-list')).toContainText(PROJECT)
    await expect(s2.win.locator('#tab-list')).toContainText(FOLDER)
    await s2.win.locator('#notif-tab-bm').click()
    await expect(s2.win.locator('#notif-bm-view')).toContainText(BOOKMARK)
  } finally {
    await closeApp(app2, dir)
  }
})

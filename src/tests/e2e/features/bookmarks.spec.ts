import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { freshStateDir, launchApp, readState, closeApp } from '../_harness.js'

// Bookmarks through the real UI: the form writes via bookmarkRepo, the panel
// reads via bookmarkRepo.getAll(). Add, delete, and confirm restore on relaunch.

async function waitForState(dir: string, pred: (st: Record<string, any>) => boolean): Promise<void> {
  await expect.poll(() => { const st = readState(dir); return !!st && pred(st) }, { timeout: 5_000 }).toBe(true)
}
async function openBookmarks(win: Page): Promise<void> {
  const open = await win.locator('#app').evaluate((el) => el.classList.contains('notif-open'))
  if (!open) await win.locator('#statusbar-notif-toggle').click()
  await win.locator('#notif-tab-bm').click()
}
async function addBookmark(win: Page, title: string): Promise<void> {
  await win.getByRole('button', { name: '+ Bookmark' }).click()
  const modal = win.locator('.modal-overlay')
  await expect(modal).toBeVisible()
  await modal.locator('input[type="text"]').first().fill(title)
  await modal.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(modal).toBeHidden()
}

const B1 = `E2E Bookmark Keep ${Date.now()}`
const B2 = `E2E Bookmark Drop ${Date.now()}`

test('bookmarks: add, delete, and restore on relaunch', async () => {
  const dir = freshStateDir()

  let app: ElectronApplication | null = null
  try {
    const s = await launchApp(dir)
    app = s.app
    const win = s.win
    await openBookmarks(win)

    await test.step('add two bookmarks -> render + persist', async () => {
      await addBookmark(win, B1)
      await addBookmark(win, B2)
      await expect(win.locator('#notif-bm-view')).toContainText(B1)
      await expect(win.locator('#notif-bm-view')).toContainText(B2)
      await waitForState(dir, (st) => (st.bookmarks ?? []).filter((b: any) => b.title === B1 || b.title === B2).length === 2)
    })

    await test.step('delete one bookmark -> gone from view + disk', async () => {
      const card = win.locator('#notif-bm-view .bookmarks-card', { hasText: B2 })
      await card.getByRole('button', { name: 'Delete' }).click()
      const confirm = win.locator('.modal-overlay') // promptConfirm
      await confirm.getByRole('button', { name: 'Delete' }).click()
      await expect(win.locator('#notif-bm-view')).not.toContainText(B2)
      await expect(win.locator('#notif-bm-view')).toContainText(B1)
      await waitForState(dir, (st) => !(st.bookmarks ?? []).some((b: any) => b.title === B2))
    })
  } finally {
    await closeApp(app)
  }

  let app2: ElectronApplication | null = null
  try {
    const s2 = await launchApp(dir)
    app2 = s2.app
    await openBookmarks(s2.win)
    await expect(s2.win.locator('#notif-bm-view')).toContainText(B1)
    await expect(s2.win.locator('#notif-bm-view')).not.toContainText(B2)
  } finally {
    await closeApp(app2, dir)
  }
})

import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Bookmarks through the real UI: the form writes via bookmarkRepo, the panel
// reads via bookmarkRepo.getAll(). Add, delete, and confirm restore on relaunch.

function freshDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'crafterm-e2e-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(d)) throw new Error('HR-5 violated: refusing real state dir')
  return d
}
function readState(dir: string): Record<string, any> | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'crafterm-state.json'), 'utf8'))
  } catch {
    return null
  }
}
async function launch(dir: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_STATE_DIR: dir } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}
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
  const dir = freshDir()

  let app: ElectronApplication | null = null
  try {
    const s = await launch(dir)
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
    if (app) await app.close()
  }

  let app2: ElectronApplication | null = null
  try {
    const s2 = await launch(dir)
    app2 = s2.app
    await openBookmarks(s2.win)
    await expect(s2.win.locator('#notif-bm-view')).toContainText(B1)
    await expect(s2.win.locator('#notif-bm-view')).not.toContainText(B2)
  } finally {
    if (app2) await app2.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

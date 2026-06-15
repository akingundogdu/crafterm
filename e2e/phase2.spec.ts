import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// End-to-end checks for the Phase 2 storage seam against the REAL Electron app:
//  - F: a malformed/old state loads resiliently (bad rows dropped, app boots).
//  - B / E.11: an entity written through its repository persists to disk and
//    survives a relaunch (repo.upsert -> persistence.save -> store:save -> file
//    -> store:load -> loadSettings/validateRows -> repo.getAll render).
// HR-5: every run uses a throwaway state dir, never the real ~/.crafterm.

const SCHEMA_VERSION = 4

function freshStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-p2-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(dir)) throw new Error('HR-5 violated: refusing real state dir')
  return dir
}

function seedState(dir: string, state: Record<string, unknown>): void {
  writeFileSync(join(dir, 'crafterm-state.json'), JSON.stringify({ schemaVersion: SCHEMA_VERSION, tree: [], ...state }))
}

function readState(dir: string): Record<string, unknown> | null {
  const f = join(dir, 'crafterm-state.json')
  if (!existsSync(f)) return null
  return JSON.parse(readFileSync(f, 'utf8'))
}

async function launch(dir: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_STATE_DIR: dir } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}

// The right panel is open by default (notifState.open); guard anyway, then show
// the Bookmarks tab.
async function openBookmarks(win: Page): Promise<void> {
  const open = await win.locator('#app').evaluate((el) => el.classList.contains('notif-open'))
  if (!open) await win.locator('#statusbar-notif-toggle').click()
  await win.locator('#notif-tab-bm').click()
  await expect(win.locator('#notif-bm-view .bm-toolbar')).toBeVisible({ timeout: 10_000 })
}

test('F: a malformed state loads without crashing and drops invalid rows', async () => {
  const dir = freshStateDir()
  let app: ElectronApplication | null = null
  try {
    seedState(dir, {
      bookmarks: [
        {
          id: 'bm-valid',
          type: 'link',
          title: 'PHASE2-VALID-BOOKMARK',
          content: 'https://example.com',
          tags: [],
          createdAt: Date.now()
        },
        { id: 'bm-bad', title: 123 } // missing/!string required fields -> rejected by schema
      ]
    })
    const launched = await launch(dir)
    app = launched.app
    await openBookmarks(launched.win)

    // The valid bookmark renders; the malformed one was dropped -> exactly 1 card.
    await expect(launched.win.locator('#notif-bm-view')).toContainText('PHASE2-VALID-BOOKMARK')
    await expect(launched.win.locator('#notif-bm-view .bm-card')).toHaveCount(1)
  } finally {
    if (app) await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('B/E.11: a bookmark added via the UI persists and survives a relaunch', async () => {
  const dir = freshStateDir()
  const title = `PHASE2-ROUNDTRIP-${Date.now()}`

  // Session 1: add a bookmark through the real form (repo.upsert -> persist).
  let app1: ElectronApplication | null = null
  try {
    const s1 = await launch(dir)
    app1 = s1.app
    await openBookmarks(s1.win)
    await s1.win.getByRole('button', { name: '+ Bookmark' }).click()
    const modal = s1.win.locator('.modal-overlay')
    await expect(modal).toBeVisible()
    await modal.locator('input[type="text"]').first().fill(title)
    await modal.getByRole('button', { name: 'Save' }).click()
    await expect(s1.win.locator('#notif-bm-view')).toContainText(title)

    // It reached disk through the debounced save.
    await expect
      .poll(
        () => {
          const st = readState(dir)
          const bms = (st?.bookmarks as Array<{ title?: string }> | undefined) ?? []
          return bms.some((b) => b.title === title)
        },
        { timeout: 5_000 }
      )
      .toBe(true)
  } finally {
    if (app1) await app1.close()
  }

  // Session 2: same state dir -> the bookmark is restored (load + validate path).
  let app2: ElectronApplication | null = null
  try {
    const s2 = await launch(dir)
    app2 = s2.app
    await openBookmarks(s2.win)
    await expect(s2.win.locator('#notif-bm-view')).toContainText(title)
  } finally {
    if (app2) await app2.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

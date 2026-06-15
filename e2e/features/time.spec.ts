import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Time tracking through the real UI: start/stop logs a time-entry via
// timeEntryRepo; the Today summary reads via timeEntryRepo.getAll(). A timer
// needs a project, so we create one first. Track a short interval, then confirm
// the entry persisted and the summary survives relaunch.

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
async function createProject(win: Page, name: string): Promise<void> {
  await win.locator('#new-project').click()
  const dlg = win.locator('.modal.prompt-modal')
  await expect(dlg).toBeVisible()
  const inputs = dlg.locator('input[type="text"]')
  await inputs.nth(0).fill(name)
  await inputs.nth(1).fill('/tmp/e2e-time')
  await dlg.getByRole('button', { name: 'Create' }).click()
  await expect(win.locator('#tab-list')).toContainText(name)
}
async function openTime(win: Page): Promise<void> {
  const open = await win.locator('#app').evaluate((el) => el.classList.contains('notif-open'))
  if (!open) await win.locator('#statusbar-notif-toggle').click()
  await win.locator('#notif-tab-time').click()
}

const PROJECT = `E2E Time Proj ${Date.now()}`

test('time tracking: start/stop logs an entry and the summary survives relaunch', async () => {
  const dir = freshDir()

  let app: ElectronApplication | null = null
  try {
    const s = await launch(dir)
    app = s.app
    const win = s.win
    await createProject(win, PROJECT)
    await openTime(win)

    await test.step('start, wait, stop -> a time-entry is logged + summarized', async () => {
      await win.locator('#time-project').selectOption({ label: PROJECT }) // the only project
      await win.locator('#time-toggle').click() // Start
      await expect(win.locator('#time-toggle')).toHaveText('Stop')
      await win.waitForTimeout(1200) // must exceed the 1s minimum to be logged
      await win.locator('#time-toggle').click() // Stop
      await expect(win.locator('#time-toggle')).toHaveText('Start')
      await waitForState(dir, (st) => (st.timeEntries ?? []).length >= 1)
      await expect(win.locator('#time-summary')).toContainText(PROJECT)
    })
  } finally {
    if (app) await app.close()
  }

  let app2: ElectronApplication | null = null
  try {
    const s2 = await launch(dir)
    app2 = s2.app
    await openTime(s2.win)
    await expect(s2.win.locator('#time-summary')).toContainText(PROJECT) // today summary restored
    expect((readState(dir)!.timeEntries ?? []).length).toBeGreaterThanOrEqual(1)
  } finally {
    if (app2) await app2.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

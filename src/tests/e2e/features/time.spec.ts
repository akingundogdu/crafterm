import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { freshStateDir, launchApp, readState, closeApp } from '../_harness.js'

// Time tracking through the real UI: start/stop logs a time-entry via
// timeEntryRepo; the Today summary reads via timeEntryRepo.getAll(). A timer
// needs a project, so we create one first. Track a short interval, then confirm
// the entry persisted and the summary survives relaunch.

async function waitForState(dir: string, pred: (st: Record<string, any>) => boolean): Promise<void> {
  await expect.poll(() => { const st = readState(dir); return !!st && pred(st) }, { timeout: 5_000 }).toBe(true)
}
async function createProject(win: Page, name: string): Promise<void> {
  await win.locator('#new-project').click()
  const dlg = win.locator('.modal.modal-prompt')
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
  const dir = freshStateDir()

  let app: ElectronApplication | null = null
  try {
    const s = await launchApp(dir)
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
    await closeApp(app)
  }

  let app2: ElectronApplication | null = null
  try {
    const s2 = await launchApp(dir)
    app2 = s2.app
    await openTime(s2.win)
    await expect(s2.win.locator('#time-summary')).toContainText(PROJECT) // today summary restored
    expect((readState(dir)!.timeEntries ?? []).length).toBeGreaterThanOrEqual(1)
  } finally {
    await closeApp(app2, dir)
  }
})

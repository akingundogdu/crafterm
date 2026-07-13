import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { freshStateDir, launchApp, readState, closeApp } from '../_harness.js'

// Reminders feature, driven through the real UI: the New-reminder form writes via
// reminderRepo -> persistence; the list reads via reminderRepo.getAll(). We add,
// delete, and confirm restore on relaunch. HR-5: throwaway state dir.
// (Helpers inlined per spec — Playwright's loader rejects cross-file .ts imports.)

async function openReminders(win: Page): Promise<void> {
  const open = await win.locator('#app').evaluate((el) => el.classList.contains('notif-open'))
  if (!open) await win.locator('#statusbar-notif-toggle').click()
  await win.locator('#notif-tab-reminders').click()
}
async function waitForState(dir: string, pred: (st: Record<string, any>) => boolean): Promise<void> {
  await expect.poll(() => { const st = readState(dir); return !!st && pred(st) }, { timeout: 5_000 }).toBe(true)
}

const R1 = `E2E Reminder Keep ${Date.now()}`
const R2 = `E2E Reminder Drop ${Date.now()}`

async function addReminder(win: Page, text: string): Promise<void> {
  await win.locator('#notif-add-reminder').click()
  const modal = win.locator('.modal.reminder-modal')
  await expect(modal).toBeVisible()
  await modal.locator('.reminder-preset').first().click() // sets a concrete "when"
  await modal.locator('.reminder-textarea').fill(text)
  await modal.getByRole('button', { name: 'Add' }).click()
  await expect(modal).toBeHidden()
}

test('reminders: add, delete, and restore on relaunch', async () => {
  const dir = freshStateDir()

  let app: ElectronApplication | null = null
  try {
    const s = await launchApp(dir)
    app = s.app
    const win = s.win
    await openReminders(win)

    await test.step('add two reminders -> render + persist', async () => {
      await addReminder(win, R1)
      await addReminder(win, R2)
      await expect(win.locator('#reminder-list')).toContainText(R1)
      await expect(win.locator('#reminder-list')).toContainText(R2)
      await waitForState(dir, (st) => (st.reminders ?? []).filter((r: any) => r.text === R1 || r.text === R2).length === 2)
    })

    await test.step('delete one reminder -> gone from list + disk', async () => {
      const row = win.locator('#reminder-list .reminder-card', { hasText: R2 })
      await row.getByRole('button', { name: 'Delete' }).click()
      await expect(win.locator('#reminder-list')).not.toContainText(R2)
      await expect(win.locator('#reminder-list')).toContainText(R1)
      await waitForState(dir, (st) => !(st.reminders ?? []).some((r: any) => r.text === R2))
    })
  } finally {
    if (app) await app.close()
  }

  let app2: ElectronApplication | null = null
  try {
    const s2 = await launchApp(dir)
    app2 = s2.app
    await openReminders(s2.win)
    await expect(s2.win.locator('#reminder-list')).toContainText(R1)
    await expect(s2.win.locator('#reminder-list')).not.toContainText(R2)
  } finally {
    await closeApp(app2, dir)
  }
})

import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { freshStateDir, launchApp, readState, closeApp } from '../_harness.js'

// Meeting notes through the real UI: the form writes via meetingNoteRepo, the
// Notebook "Meeting Notes" sub-tab reads via meetingNoteRepo.getAll(). Add a
// note and confirm restore on relaunch.

async function waitForState(dir: string, pred: (st: Record<string, any>) => boolean): Promise<void> {
  await expect.poll(() => { const st = readState(dir); return !!st && pred(st) }, { timeout: 5_000 }).toBe(true)
}
async function openMeetingNotes(win: Page): Promise<void> {
  await win.locator('#tab-notebook').click()
  await win.locator('.notebook-mode-tab', { hasText: 'Meeting Notes' }).click()
  await expect(win.locator('.nb-subtab-body')).toBeVisible()
}

const M1 = `E2E Meeting ${Date.now()}`

test('meeting notes: add a note via the UI and restore on relaunch', async () => {
  const dir = freshStateDir()

  let app: ElectronApplication | null = null
  try {
    const s = await launchApp(dir)
    app = s.app
    const win = s.win
    await openMeetingNotes(win)

    await test.step('add a note -> renders + persists', async () => {
      await win.getByRole('button', { name: '+ New meeting' }).click()
      const form = win.locator('.modal-overlay')
      await expect(form).toBeVisible()
      await form.locator('input[type="text"]').first().fill(M1) // Meeting subject
      await form.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(form).toBeHidden()
      await expect(win.locator('.nb-subtab-body')).toContainText(M1)
      await waitForState(dir, (st) => (st.meetingNotes ?? []).some((n: any) => n.title === M1))
    })
  } finally {
    await closeApp(app)
  }

  let app2: ElectronApplication | null = null
  try {
    const s2 = await launchApp(dir)
    app2 = s2.app
    await openMeetingNotes(s2.win)
    await expect(s2.win.locator('.nb-subtab-body')).toContainText(M1)
  } finally {
    await closeApp(app2, dir)
  }
})

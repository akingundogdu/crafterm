import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Meeting notes through the real UI: the form writes via meetingNoteRepo, the
// Notebook "Meeting Notes" sub-tab reads via meetingNoteRepo.getAll(). Add a
// note and confirm restore on relaunch.

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
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: dir } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}
async function waitForState(dir: string, pred: (st: Record<string, any>) => boolean): Promise<void> {
  await expect.poll(() => { const st = readState(dir); return !!st && pred(st) }, { timeout: 5_000 }).toBe(true)
}
async function openMeetingNotes(win: Page): Promise<void> {
  await win.locator('#tab-notebook').click()
  await win.locator('.nb-subtab', { hasText: 'Meeting Notes' }).click()
  await expect(win.locator('.nb-subtab-body')).toBeVisible()
}

const M1 = `E2E Meeting ${Date.now()}`

test('meeting notes: add a note via the UI and restore on relaunch', async () => {
  const dir = freshDir()

  let app: ElectronApplication | null = null
  try {
    const s = await launch(dir)
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
    if (app) await app.close()
  }

  let app2: ElectronApplication | null = null
  try {
    const s2 = await launch(dir)
    app2 = s2.app
    await openMeetingNotes(s2.win)
    await expect(s2.win.locator('.nb-subtab-body')).toContainText(M1)
  } finally {
    if (app2) await app2.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

import { test, expect, _electron as electron, type ElectronApplication, type Page, type Locator } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Daily Plan board through the real UI: the task form writes via dailyTaskRepo,
// the board reads via dailyTaskRepo.getAll(). A task requires a project (issue
// key), so we create one in the sidebar first. Add a task, delete it, and
// confirm restore on relaunch.

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
  await inputs.nth(1).fill('/tmp/e2e-dp')
  await dlg.getByRole('button', { name: 'Create' }).click()
  await expect(win.locator('#tab-list')).toContainText(name)
}
async function openDailyPlan(win: Page): Promise<Locator> {
  await win.locator('#sidebar-actions').click()
  await win.locator('.context-menu button', { hasText: 'Daily plan' }).click()
  const modal = win.locator('.modal.daily-plan-modal')
  await expect(modal).toBeVisible()
  return modal
}

const PROJECT = `E2E DP Proj ${Date.now()}`
const T1 = `E2E Task Keep ${Date.now()}`
const T2 = `E2E Task Drop ${Date.now()}`

async function addTask(win: Page, board: Locator, title: string): Promise<void> {
  await board.getByRole('button', { name: '+ New task' }).click()
  const form = win.locator('.daily-plan-form-overlay')
  await expect(form).toBeVisible()
  await form.locator('.daily-plan-title-input').fill(title)
  const projSel = form.locator('select', { has: win.locator('option', { hasText: 'Select a project' }) })
  await projSel.selectOption({ label: PROJECT }) // project is required
  await form.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(form).toBeHidden()
}

test('daily plan: add a task, delete one, and restore on relaunch', async () => {
  const dir = freshDir()

  let app: ElectronApplication | null = null
  try {
    const s = await launch(dir)
    app = s.app
    const win = s.win
    await createProject(win, PROJECT)
    const board = await openDailyPlan(win)

    await test.step('add two tasks -> cards render + persist', async () => {
      await addTask(win, board, T1)
      await addTask(win, board, T2)
      await expect(board.locator('.daily-plan-board')).toContainText(T1)
      await expect(board.locator('.daily-plan-board')).toContainText(T2)
      await waitForState(dir, (st) => (st.dailyPlan?.tasks ?? []).filter((t: any) => t.title === T1 || t.title === T2).length === 2)
    })

    await test.step('delete one task -> gone from board + disk', async () => {
      const card = board.locator('.daily-plan-card', { hasText: T2 })
      await card.locator('[title="Delete"]').click()
      const confirm = win.locator('.modal-overlay').last()
      await confirm.getByRole('button', { name: 'Delete' }).click()
      await expect(board.locator('.daily-plan-board')).not.toContainText(T2)
      await expect(board.locator('.daily-plan-board')).toContainText(T1)
      await waitForState(dir, (st) => !(st.dailyPlan?.tasks ?? []).some((t: any) => t.title === T2))
    })
  } finally {
    if (app) await app.close()
  }

  let app2: ElectronApplication | null = null
  try {
    const s2 = await launch(dir)
    app2 = s2.app
    const board = await openDailyPlan(s2.win)
    await expect(board.locator('.daily-plan-board')).toContainText(T1)
    await expect(board.locator('.daily-plan-board')).not.toContainText(T2)
  } finally {
    if (app2) await app2.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

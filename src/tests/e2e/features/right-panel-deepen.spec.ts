import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Right panel §6 deepen: the remind-me/snooze popover on a notification card creates
// a reminder, and a fired reminder carrying a payload target shows an Open action
// that navigates to it. Reminders fire on the launch tick (no 20s wait), mirroring
// reminders-fire.spec. HR-5: throwaway state dir only.

const TODAY = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

function freshStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-rpd-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(dir)) throw new Error('HR-5 violated: refusing real state dir')
  return dir
}
function readState(dir: string): Record<string, any> | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'crafterm-state.json'), 'utf8'))
  } catch {
    return null
  }
}
function writeState(dir: string, state: Record<string, any>): void {
  writeFileSync(join(dir, 'crafterm-state.json'), JSON.stringify({ schemaVersion: 4, notifSound: '', ...state }))
}
async function launch(dir: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: dir } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}

test('right-panel: the remind-me popover on a card creates a reminder', async () => {
  const dir = freshStateDir()
  writeState(dir, {
    tree: [],
    notifications: [{ id: 'n-pane', paneId: 'pane-xyz', title: 'E2E Pane Card', group: 'proj', message: 'needs you', event: 'question', time: Date.now() }]
  })
  const { app, win } = await launch(dir)
  try {
    await win.locator('#notif-tab-notifs').click()
    const card = win.locator('.notif-card', { hasText: 'E2E Pane Card' })
    await expect(card).toBeVisible({ timeout: 10_000 })
    await card.locator('.notif-card-chevron').click() // expand to reveal the body + remind button
    await card.locator('.notif-card-remind').click()
    const popover = win.locator('.notif-remind-popover')
    await expect(popover).toBeVisible()
    await popover.locator('.notif-snooze-chip').first().click() // pick the first preset

    // a one-shot reminder with the pane payload was created
    await expect
      .poll(
        () => (readState(dir)?.reminders ?? []).some((r: any) => r.repeat === 'none' && r.enabled === true && r.payload?.kind === 'pane' && r.payload?.paneId === 'pane-xyz'),
        { timeout: 5_000 }
      )
      .toBe(true)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('right-panel: a fired reminder with a payload target shows an Open action that navigates', async () => {
  const dir = freshStateDir()
  const past = Date.now() - 60_000
  writeState(dir, {
    tree: [],
    notifications: [],
    dailyPlan: {
      tags: [],
      tasks: [{ id: 'task-e2e', title: 'E2E Linked Task', date: TODAY, status: 'todo', priority: 'medium', tagIds: [], order: 0, createdAt: 1, updatedAt: 1 }]
    },
    reminders: [{ id: 'rem-payload', text: 'E2E Payload Fire', time: past, repeat: 'none', enabled: true, payload: { kind: 'dailyTask', taskId: 'task-e2e' } }]
  })
  const { app, win } = await launch(dir)
  try {
    const card = win.locator('#notif-list .notif-card', { hasText: 'E2E Payload Fire' })
    await expect(card).toBeVisible({ timeout: 10_000 }) // fired on the launch tick
    await card.locator('.notif-card-chevron').click() // expand body
    const openBtn = card.locator('.notif-open-chip')
    await expect(openBtn).toBeVisible()
    await openBtn.click()
    // payload kind 'dailyTask' → showDailyPlanModal opens the board (in-app, no side effects)
    await expect(win.locator('.modal.daily-plan-modal')).toBeVisible({ timeout: 10_000 })
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

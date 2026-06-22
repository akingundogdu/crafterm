import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Daily-plan board interactions (§8), deeper than the CRUD in daily-plan.spec:
// drag a card between columns (status persists), tag filtering, and the changelog
// report. Tasks are seeded into crafterm-state.json (no project needed for these).
// HR-5: throwaway state dir only.

const TODAY = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

function freshStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-dp-'))
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
function task(over: Record<string, any>): Record<string, any> {
  return { id: 'x', title: 'T', date: TODAY, status: 'todo', priority: 'medium', tagIds: [], order: 0, createdAt: 0, updatedAt: 0, ...over }
}
function seedDailyPlan(dir: string, tasks: Record<string, any>[], tags: Record<string, any>[] = []): void {
  writeFileSync(join(dir, 'crafterm-state.json'), JSON.stringify({ schemaVersion: 4, tree: [], dailyPlan: { tasks, tags } }))
}
async function launch(dir: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: dir } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}
async function openBoard(win: Page): Promise<Page['locator'] extends never ? never : ReturnType<Page['locator']>> {
  await win.locator('#sidebar-actions').click()
  await win.locator('.context-menu').getByRole('button', { name: /Daily plan/i }).click()
  const board = win.locator('.modal.daily-plan-modal')
  await expect(board).toBeVisible({ timeout: 10_000 })
  return board
}

test('daily-plan: drag a card to another column persists its status', async () => {
  const dir = freshStateDir()
  seedDailyPlan(dir, [task({ id: 'seed-1', title: 'Seed Task A', status: 'todo' })])
  const { app, win } = await launch(dir)
  try {
    const board = await openBoard(win)
    const card = board.locator('.daily-plan-card', { hasText: 'Seed Task A' })
    await expect(card).toBeVisible()
    await card.dragTo(board.locator('.daily-plan-column[data-status="done"] .daily-plan-column-body'))
    await expect(board.locator('.daily-plan-column[data-status="done"]')).toContainText('Seed Task A')
    await expect
      .poll(() => readState(dir)?.dailyPlan?.tasks?.find((t: any) => t.id === 'seed-1')?.status === 'done', { timeout: 5_000 })
      .toBe(true)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('daily-plan: a tag filter narrows the board', async () => {
  const dir = freshStateDir()
  seedDailyPlan(
    dir,
    [task({ id: 't-tag', title: 'Tagged Task', tagIds: ['tag-1'] }), task({ id: 't-plain', title: 'Plain Task', order: 1 })],
    [{ id: 'tag-1', name: 'backend', color: '#3b82f6' }]
  )
  const { app, win } = await launch(dir)
  try {
    const board = await openBoard(win)
    await expect(board).toContainText('Tagged Task')
    await expect(board).toContainText('Plain Task')
    await board.locator('.daily-tagfilter-btn').click()
    await win.locator('.daily-tagfilter-pop .daily-tagfilter-row', { hasText: 'backend' }).click() // popover is on document.body
    await expect(board.locator('.daily-plan-board')).toContainText('Tagged Task')
    await expect(board.locator('.daily-plan-board')).not.toContainText('Plain Task')
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('daily-plan: the changelog report lists done tasks', async () => {
  const dir = freshStateDir()
  seedDailyPlan(dir, [task({ id: 'd-1', title: 'Seed Done Task', status: 'done' })])
  const { app, win } = await launch(dir)
  try {
    const board = await openBoard(win)
    await board.getByRole('button', { name: 'Changelog' }).click()
    const modal = win.locator('.modal.changelog-modal')
    await expect(modal).toBeVisible()
    await modal.getByRole('button', { name: 'Generate' }).click()
    await expect(modal.locator('.changelog-output')).toHaveValue(/# Changelog/)
    await expect(modal.locator('.changelog-output')).toHaveValue(/Seed Done Task/)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

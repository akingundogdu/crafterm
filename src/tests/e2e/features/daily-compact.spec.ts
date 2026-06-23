import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Daily-plan compact view (§8): the Notebook-mode "Daily Plan" sub-tab board —
// status tabs filter, search narrows, open-full opens the wide board, and Cmd+N
// opens the new-task form (the notebook→daily gated shortcut). HR-5: throwaway dir.

const TODAY = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

function freshStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-dc-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(dir)) throw new Error('HR-5 violated: refusing real state dir')
  return dir
}
function task(over: Record<string, any>): Record<string, any> {
  return { id: 'x', title: 'T', date: TODAY, status: 'todo', priority: 'medium', tagIds: [], order: 0, createdAt: 0, updatedAt: 0, ...over }
}
function seedDailyPlan(dir: string, tasks: Record<string, any>[]): void {
  writeFileSync(join(dir, 'crafterm-state.json'), JSON.stringify({ schemaVersion: 4, tree: [], dailyPlan: { tasks, tags: [] } }))
}
async function launch(dir: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: dir } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}
async function openCompact(win: Page): Promise<ReturnType<Page['locator']>> {
  await win.locator('#tab-notebook').click()
  await win.locator('.notebook-mode-tab', { hasText: 'Daily Plan' }).click()
  const compact = win.locator('.daily-compact')
  await expect(compact).toBeVisible({ timeout: 12_000 })
  return compact
}

test('daily-compact: status tabs filter the list', async () => {
  const dir = freshStateDir()
  seedDailyPlan(dir, [task({ id: 'c-todo', title: 'Compact Todo', status: 'todo' }), task({ id: 'c-done', title: 'Compact Done', status: 'done', order: 1 })])
  const { app, win } = await launch(dir)
  try {
    const compact = await openCompact(win)
    const list = compact.locator('.daily-compact-list')
    await expect(list).toContainText('Compact Todo') // default Todo tab
    await expect(list).not.toContainText('Compact Done')

    await compact.locator('.daily-compact-tab', { hasText: 'Done' }).click()
    await expect(list).toContainText('Compact Done')
    await expect(list).not.toContainText('Compact Todo')
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('daily-compact: search narrows the active list', async () => {
  const dir = freshStateDir()
  seedDailyPlan(dir, [task({ id: 'a', title: 'Alpha Task', status: 'todo' }), task({ id: 'b', title: 'Beta Task', status: 'todo', order: 1 })])
  const { app, win } = await launch(dir)
  try {
    const compact = await openCompact(win)
    const list = compact.locator('.daily-compact-list')
    await expect(list).toContainText('Alpha Task')
    await expect(list).toContainText('Beta Task')

    await win.locator('input.nb-subtab-search').fill('Alpha')
    await expect(list).toContainText('Alpha Task')
    await expect(list).not.toContainText('Beta Task')
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('daily-compact: open-full opens the wide board', async () => {
  const dir = freshStateDir()
  seedDailyPlan(dir, [task({ id: 'f', title: 'Full Task', status: 'todo' })])
  const { app, win } = await launch(dir)
  try {
    const compact = await openCompact(win)
    await compact.locator('.daily-compact-full').click()
    await expect(win.locator('.modal.daily-plan-modal')).toBeVisible({ timeout: 10_000 })
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('daily-compact: Cmd+N opens the new-task form (notebook→daily gate)', async () => {
  const dir = freshStateDir()
  seedDailyPlan(dir, [])
  const { app, win } = await launch(dir)
  try {
    await openCompact(win)
    await win.keyboard.press('Meta+n')
    await expect(win.locator('.daily-plan-form-overlay')).toBeVisible({ timeout: 10_000 })
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

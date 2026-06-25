import { test, expect, type Page, type Locator } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { freshStateDir, launchApp, readState, closeApp } from './_harness.js'

// Close-actions modal + worktree delete (§3.19 / §4.5): closing a terminal pane
// that lives inside a managed git worktree shows the close-actions modal. The
// "Delete worktree" switch (default ON) runs `git worktree remove --force`,
// physically deleting the worktree folder + archiving the node; OFF keeps it. A
// pane bound to a daily task also gets a "Mark task as done" switch. Cancel keeps
// the terminal open. Backed by a real throwaway git repo. HR-5: throwaway state dir.

function gitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_AUTHOR_NAME: 'e2e',
    GIT_AUTHOR_EMAIL: 'e2e@test',
    GIT_COMMITTER_NAME: 'e2e',
    GIT_COMMITTER_EMAIL: 'e2e@test'
  }
}
// realpath the container so every path (git, the reconciled node, the pane cwd) is
// canonical — this avoids the macOS /var -> /private/var mismatch that would stop
// worktreeForCwd() from matching the pane to its worktree node (modal never shows).
function makeRepoWithWorktree(branch: string): { container: string; repo: string; wtPath: string } {
  const container = realpathSync(mkdtempSync(join(tmpdir(), 'crafterm-e2e-wca-')))
  const repo = join(container, 'repo')
  mkdirSync(repo, { recursive: true })
  execSync('git init -b main', { cwd: repo, env: gitEnv() })
  execSync('git commit --allow-empty -m init', { cwd: repo, env: gitEnv() })
  const wtPath = join(container, 'worktrees', branch)
  mkdirSync(join(container, 'worktrees'), { recursive: true })
  execSync(`git worktree add "${wtPath}" -b ${branch} main`, { cwd: repo, env: gitEnv() })
  return { container, repo, wtPath }
}
function worktreeNodes(dir: string): any[] {
  const walk = (nodes: any[]): any[] =>
    (nodes ?? []).flatMap((n) => (n.kind === 'worktree' ? [n, ...walk(n.children)] : walk(n.children)))
  return walk(readState(dir)?.tree ?? [])
}
function tasks(dir: string): any[] {
  return readState(dir)?.dailyPlan?.tasks ?? []
}

// Seed a project (supportWorktree → reconcile materializes the worktree node) plus a
// terminal tab whose leaf cwd is the worktree path, optionally bound to a daily task
// (the leaf carries tickets:[taskId], the canonical persisted pane↔task binding).
function seed(stateDir: string, repo: string, wtPath: string, opts?: { task?: any; ticket?: string }): void {
  const leaf: Record<string, any> = { type: 'leaf', stableId: 'aaaaaaaa-bbbb-4ccc-8ddd-000000000020', cwd: wtPath }
  if (opts?.ticket) leaf.tickets = [opts.ticket]
  const state: Record<string, any> = {
    schemaVersion: 4,
    tree: [
      { kind: 'project', id: 'p-test', name: 'Repo', color: null, collapsed: false, pinned: false, children: [], path: repo, supportWorktree: true },
      { kind: 'tab', title: 'WT', titleLocked: false, color: null, pinned: false, status: 'idle', root: leaf }
    ]
  }
  if (opts?.task) state.dailyPlan = { tags: [], tasks: [opts.task] }
  writeFileSync(join(stateDir, 'crafterm-state.json'), JSON.stringify(state))
}

// Wait for the worktree node to reconcile (worktreeForCwd only matches a materialized
// node), then close the pane to bring up the close-actions modal.
async function openCloseModal(win: Page, dir: string, branch: string): Promise<Locator> {
  await expect(win.locator('.pane-box')).toHaveCount(1)
  await expect.poll(() => worktreeNodes(dir).some((w) => w.branch === branch), { timeout: 30_000 }).toBe(true)
  await win.locator('.pane-box.active .pane-close').click()
  const modal = win.locator('.close-actions-modal')
  await expect(modal).toBeVisible({ timeout: 10_000 })
  return modal
}

test('close-actions: Delete-worktree ON removes the folder from disk + archives the node', async () => {
  const { container, repo, wtPath } = makeRepoWithWorktree('wt-del')
  const dir = freshStateDir('crafterm-e2e-wcas-')
  seed(dir, repo, wtPath)
  const { app, win } = await launchApp(dir)
  try {
    const modal = await openCloseModal(win, dir, 'wt-del')
    const wtRow = modal.locator('.close-action-row', { hasText: 'Delete worktree' })
    await expect(wtRow).toBeVisible()
    await expect(wtRow.locator('.close-action-key')).toHaveText('wt-del')
    await expect(wtRow.locator('.close-action-path')).toHaveText(wtPath)
    await expect(wtRow.locator('input[type=checkbox]')).toBeChecked() // default ON
    expect(existsSync(wtPath)).toBe(true)

    await modal.locator('.modal-actions button.button-primary').click()
    await expect(win.locator('.modal-overlay')).toHaveCount(0)
    // git worktree remove --force physically deletes the worktree dir...
    await expect.poll(() => !existsSync(wtPath), { timeout: 30_000 }).toBe(true)
    // ...and the sidebar node flips to archived (only happens on git exit 0).
    await expect
      .poll(() => worktreeNodes(dir).find((w) => w.branch === 'wt-del')?.status === 'archived', { timeout: 30_000 })
      .toBe(true)
  } finally {
    await closeApp(app, dir, container)
  }
})

test('close-actions: Delete-worktree OFF keeps the folder, still closes the pane', async () => {
  const { container, repo, wtPath } = makeRepoWithWorktree('wt-keep')
  const dir = freshStateDir('crafterm-e2e-wcas-')
  seed(dir, repo, wtPath)
  const { app, win } = await launchApp(dir)
  try {
    const modal = await openCloseModal(win, dir, 'wt-keep')
    const wtRow = modal.locator('.close-action-row', { hasText: 'Delete worktree' })
    // the checkbox is opacity:0 under the slider label; uncheck it directly (force
    // bypasses the visual overlay). confirm reads input.checked, so this is enough.
    await wtRow.locator('input[type=checkbox]').uncheck({ force: true })
    await expect(wtRow.locator('input[type=checkbox]')).not.toBeChecked()

    await modal.locator('.modal-actions button.button-primary').click()
    await expect(win.locator('.modal-overlay')).toHaveCount(0)
    // Delete OFF → the worktree is NOT removed: folder stays + node stays idle...
    expect(existsSync(wtPath)).toBe(true)
    await expect
      .poll(() => worktreeNodes(dir).find((w) => w.branch === 'wt-keep')?.status === 'idle', { timeout: 10_000 })
      .toBe(true)
    // ...while the terminal session itself was closed (its tab archived). Closing the
    // last pane spawns a fresh starter terminal, so assert the archive, not a count.
    await expect
      .poll(
        () => (readState(dir)?.tree ?? []).find((n: any) => n.kind === 'tab' && n.title === 'WT')?.status === 'archived',
        { timeout: 10_000 }
      )
      .toBe(true)
  } finally {
    await closeApp(app, dir, container)
  }
})

test('close-actions: a daily-task pane shows the Mark-done switch; confirm marks it done + deletes the worktree', async () => {
  const { container, repo, wtPath } = makeRepoWithWorktree('wt-task')
  const dir = freshStateDir('crafterm-e2e-wcas-')
  const TASK_ID = 'task-close-1'
  seed(dir, repo, wtPath, {
    ticket: TASK_ID,
    task: {
      id: TASK_ID,
      title: 'Finish the thing',
      issueKey: 'CRF-9',
      date: '2026-06-22',
      status: 'todo',
      priority: 'medium',
      tagIds: [],
      order: 0,
      createdAt: 1,
      updatedAt: 1
    }
  })
  const { app, win } = await launchApp(dir)
  try {
    const modal = await openCloseModal(win, dir, 'wt-task')
    const taskRow = modal.locator('.close-action-row', { hasText: 'Mark task as done' })
    await expect(taskRow).toBeVisible()
    await expect(taskRow.locator('.close-action-title')).toHaveText('Finish the thing')
    await expect(taskRow.locator('input[type=checkbox]')).toBeChecked() // default ON
    await expect(modal.locator('.close-action-row', { hasText: 'Delete worktree' })).toBeVisible()

    await modal.locator('.modal-actions button.button-primary').click()
    await expect(win.locator('.modal-overlay')).toHaveCount(0)
    await expect.poll(() => tasks(dir).find((t) => t.id === TASK_ID)?.status === 'done', { timeout: 10_000 }).toBe(true)
    await expect.poll(() => !existsSync(wtPath), { timeout: 30_000 }).toBe(true)
  } finally {
    await closeApp(app, dir, container)
  }
})

test('close-actions: Cancel keeps the terminal open and the worktree on disk', async () => {
  const { container, repo, wtPath } = makeRepoWithWorktree('wt-cancel')
  const dir = freshStateDir('crafterm-e2e-wcas-')
  seed(dir, repo, wtPath)
  const { app, win } = await launchApp(dir)
  try {
    const modal = await openCloseModal(win, dir, 'wt-cancel')
    await modal.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(win.locator('.modal-overlay')).toHaveCount(0)
    await expect(win.locator('.pane-box')).toHaveCount(1) // terminal stays open
    expect(existsSync(wtPath)).toBe(true)
    await expect.poll(() => worktreeNodes(dir).find((w) => w.branch === 'wt-cancel')?.status).toBe('idle')
  } finally {
    await closeApp(app, dir, container)
  }
})

import { test, expect, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { freshStateDir, launchApp, selectTab, readState, closeApp } from '../_harness.js'

// Daily-plan task actions (§8.7 / §8.8): Open in Claude (▶ card → seeded terminal,
// task → In Progress, pane bound), Run in worktree (real git worktree + terminal at
// its cwd), and the pane ⋯ menu task actions (mark review/test/done, assign, view
// detail). Backed by a real throwaway git repo. HR-5: throwaway state dir only.

const TODAY = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

function gitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_AUTHOR_NAME: 'e2e',
    GIT_AUTHOR_EMAIL: 'e2e@test',
    GIT_COMMITTER_NAME: 'e2e',
    GIT_COMMITTER_EMAIL: 'e2e@test'
  }
}
// realpath the container so the worktree git creates + the pane's reported cwd share
// one canonical form (macOS /var -> /private/var), matching worktree-status detection.
function makeRepo(): { container: string; repo: string } {
  const container = realpathSync(mkdtempSync(join(tmpdir(), 'crafterm-e2e-dpa-')))
  const repo = join(container, 'repo')
  mkdirSync(repo, { recursive: true })
  execSync('git init -b main', { cwd: repo, env: gitEnv() })
  execSync('git commit --allow-empty -m init', { cwd: repo, env: gitEnv() })
  return { container, repo }
}
function task(over: Record<string, any>): Record<string, any> {
  return { id: 'x', title: 'T', date: TODAY, status: 'todo', priority: 'medium', tagIds: [], order: 0, createdAt: 0, updatedAt: 0, ...over }
}
// Collect every layout leaf from every tab node at ANY depth — "Open in Claude"
// nests the new terminal tab UNDER its project node, not at the tree root.
function leaves(dir: string): any[] {
  const fromRoot = (n: any): any[] => (n?.type === 'leaf' ? [n] : (n?.children ?? []).flatMap(fromRoot))
  const walk = (nodes: any[]): any[] =>
    (nodes ?? []).flatMap((n) => [...(n.kind === 'tab' ? fromRoot(n.root) : []), ...(n.children ? walk(n.children) : [])])
  return walk(readState(dir)?.tree ?? [])
}
function taskOnDisk(dir: string, id: string): any {
  return (readState(dir)?.dailyPlan?.tasks ?? []).find((t: any) => t.id === id)
}
function worktreeNodes(dir: string): any[] {
  const walk = (nodes: any[]): any[] =>
    (nodes ?? []).flatMap((n) => (n.kind === 'worktree' ? [n, ...walk(n.children)] : walk(n.children)))
  return walk(readState(dir)?.tree ?? [])
}
// Project (path = a real dir so terminals can spawn there) + the daily-plan tasks,
// plus an optional pre-bound terminal tab (for the pane-menu tests).
function seedState(dir: string, repo: string, tasks: Record<string, any>[], opts?: { tab?: any; supportWorktree?: boolean }): void {
  const tree: Record<string, any>[] = [
    {
      kind: 'project', id: 'p-test', name: 'Repo', color: null, collapsed: false, pinned: false, children: [],
      path: repo, issueKeyPrefix: 'CRF', supportWorktree: opts?.supportWorktree ?? false
    }
  ]
  if (opts?.tab) tree.push(opts.tab)
  writeFileSync(join(dir, 'crafterm-state.json'), JSON.stringify({ schemaVersion: 4, tree, dailyPlan: { tasks, tags: [] } }))
}
function boundTab(taskId: string): Record<string, any> {
  return {
    kind: 'tab', title: 'CRF-1', titleLocked: true, color: null, pinned: false, status: 'idle',
    root: {
      type: 'leaf', stableId: 'aaaaaaaa-bbbb-4ccc-8ddd-000000000031', cwd: '__REPO__',
      claude: true, claudeSessionId: 'aaaaaaaa-bbbb-4ccc-8ddd-000000000031', projectId: 'p-test', tickets: [taskId]
    }
  }
}
async function openBoard(win: Page): Promise<ReturnType<Page['locator']>> {
  await win.locator('#sidebar-actions').click()
  await win.locator('.context-menu').getByRole('button', { name: /Daily plan/i }).click()
  const board = win.locator('.modal.daily-plan-modal')
  await expect(board).toBeVisible({ timeout: 10_000 })
  return board
}
async function openPaneMenu(win: Page): Promise<ReturnType<Page['locator']>> {
  await win.locator('.pane-box .pane-btn').first().click()
  const menu = win.locator('.context-menu')
  await expect(menu).toBeVisible()
  return menu
}

test('daily-plan: Open in Claude spawns a bound terminal, moves the task to In Progress, seeds the prompt', async () => {
  const { container, repo } = makeRepo()
  const dir = freshStateDir('crafterm-e2e-dpas-')
  seedState(dir, repo, [
    task({ id: 'seed-1', title: 'Open in Claude task', description: 'do the thing', projectId: 'p-test', issueKey: 'CRF-1', status: 'todo' })
  ])
  const { app, win } = await launchApp(dir)
  try {
    const board = await openBoard(win)
    const card = board.locator('.daily-plan-card', { hasText: 'Open in Claude task' })
    await expect(card).toBeVisible()
    await card.locator('[title="Open in Claude terminal"]').click()

    // a terminal for the task spawns in the sidebar...
    await expect(win.locator('#tab-list .tab-item .tab-title', { hasText: 'Open in Claude task' })).toBeVisible({ timeout: 15_000 })
    // ...the task moves to In Progress (wip) on disk + into the wip column...
    await expect.poll(() => taskOnDisk(dir, 'seed-1')?.status === 'wip', { timeout: 10_000 }).toBe(true)
    await expect(board.locator('.daily-plan-column[data-status="wip"]')).toContainText('Open in Claude task')
    // ...the pane is bound to the task (canonical leaf.tickets)...
    await expect.poll(() => leaves(dir).some((l) => l.tickets?.[0] === 'seed-1'), { timeout: 10_000 }).toBe(true)
    // ...the pane header shows the issue-key chip...
    await expect(win.locator('.pane-box.active .pane-daily-chip', { hasText: 'CRF-1' })).toBeVisible({ timeout: 10_000 })
    // ...and the seeded prompt (ultrathink + issue key) is typed into the terminal.
    await expect(win.locator('.pane-box.active .xterm-rows')).toContainText('ultrathink', { timeout: 15_000 })
    await expect(win.locator('.pane-box.active .xterm-rows')).toContainText('CRF-1')
  } finally {
    await closeApp(app, dir, container)
  }
})

test('daily-plan: Run in worktree creates the git worktree + opens a terminal at its cwd', async () => {
  const { container, repo } = makeRepo()
  const dir = freshStateDir('crafterm-e2e-dpas-')
  seedState(dir, repo, [task({ id: 'wt-1', title: 'WT task', projectId: 'p-test', issueKey: 'CRF-1', status: 'todo' })], {
    supportWorktree: true
  })
  const { app, win } = await launchApp(dir)
  try {
    const board = await openBoard(win)
    const card = board.locator('.daily-plan-card', { hasText: 'WT task' })
    await card.locator('[title="Edit"]').click() // worktree action lives in the edit form
    const form = win.locator('.daily-plan-form-overlay')
    await expect(form).toBeVisible()
    await form.getByRole('button', { name: /Run in worktree/ }).click()

    // a real git worktree + branch CRF-1 materializes as a node under the project...
    await expect.poll(() => worktreeNodes(dir).some((w) => w.branch === 'CRF-1'), { timeout: 30_000 }).toBe(true)
    const node = worktreeNodes(dir).find((w) => w.branch === 'CRF-1')
    expect(Boolean(node?.worktreePath && existsSync(node.worktreePath))).toBe(true) // folder actually on disk
    // ...and a terminal opens at the worktree cwd (worktree status segment present).
    await expect(win.locator('.pane-box.active .pane-status-seg.worktree')).toBeVisible({ timeout: 20_000 })
  } finally {
    await closeApp(app, dir, container)
  }
})

test('daily-plan: pane ⋯ menu marks the bound task review → test → done', async () => {
  const { container, repo } = makeRepo()
  const dir = freshStateDir('crafterm-e2e-dpas-')
  const tab = boundTab('seed-1')
  tab.root.cwd = repo
  seedState(dir, repo, [task({ id: 'seed-1', title: 'Pane task', projectId: 'p-test', issueKey: 'CRF-1', status: 'wip' })], { tab })
  const { app, win } = await launchApp(dir)
  try {
    await selectTab(win, 'CRF-1') // the seeded tab restores unselected; activate it
    await expect(win.locator('.pane-box .pane-daily-chip', { hasText: 'CRF-1' })).toBeVisible({ timeout: 10_000 })

    await (await openPaneMenu(win)).getByRole('button', { name: 'Mark as code review', exact: true }).click()
    await expect.poll(() => taskOnDisk(dir, 'seed-1')?.status === 'review', { timeout: 10_000 }).toBe(true)

    await (await openPaneMenu(win)).getByRole('button', { name: 'Mark as test', exact: true }).click()
    await expect.poll(() => taskOnDisk(dir, 'seed-1')?.status === 'test', { timeout: 10_000 }).toBe(true)

    await (await openPaneMenu(win)).getByRole('button', { name: 'Mark as done', exact: true }).click()
    await expect.poll(() => taskOnDisk(dir, 'seed-1')?.status === 'done', { timeout: 10_000 }).toBe(true)
  } finally {
    await closeApp(app, dir, container)
  }
})

test('daily-plan: pane ⋯ menu assigns an unbound pane to a task', async () => {
  const { container, repo } = makeRepo()
  const dir = freshStateDir('crafterm-e2e-dpas-')
  // an unbound terminal pane (no tickets) + a task to assign it to.
  const tab = {
    kind: 'tab', title: 'Term', titleLocked: false, color: null, pinned: false, status: 'idle',
    root: { type: 'leaf', stableId: 'aaaaaaaa-bbbb-4ccc-8ddd-000000000032', cwd: repo, claude: true, claudeSessionId: 'aaaaaaaa-bbbb-4ccc-8ddd-000000000032' }
  }
  seedState(dir, repo, [task({ id: 'seed-1', title: 'Assignable task', projectId: 'p-test', issueKey: 'CRF-1', status: 'wip' })], { tab })
  const { app, win } = await launchApp(dir)
  try {
    await selectTab(win, 'Term') // the seeded tab restores unselected; activate it
    await (await openPaneMenu(win)).getByRole('button', { name: /Assign to daily task/ }).click()
    const assign = win.locator('.daily-assign-modal')
    await expect(assign).toBeVisible()
    await assign.locator('.daily-assign-row', { hasText: 'Assignable task' }).click()

    await expect.poll(() => leaves(dir).some((l) => l.tickets?.[0] === 'seed-1'), { timeout: 10_000 }).toBe(true)
    await expect(win.locator('.pane-box .pane-daily-chip', { hasText: 'CRF-1' })).toBeVisible({ timeout: 10_000 })
  } finally {
    await closeApp(app, dir, container)
  }
})

test('daily-plan: pane ⋯ menu "View ticket detail" opens the task form', async () => {
  const { container, repo } = makeRepo()
  const dir = freshStateDir('crafterm-e2e-dpas-')
  const tab = boundTab('seed-1')
  tab.root.cwd = repo
  seedState(dir, repo, [task({ id: 'seed-1', title: 'Detail task', projectId: 'p-test', issueKey: 'CRF-1', status: 'wip' })], { tab })
  const { app, win } = await launchApp(dir)
  try {
    await selectTab(win, 'CRF-1') // the seeded tab restores unselected; activate it
    await expect(win.locator('.pane-box .pane-daily-chip', { hasText: 'CRF-1' })).toBeVisible({ timeout: 10_000 })
    await (await openPaneMenu(win)).getByRole('button', { name: /View ticket detail/ }).click()
    const form = win.locator('.daily-plan-form-overlay')
    await expect(form).toBeVisible({ timeout: 10_000 })
    await expect(form.locator('.daily-plan-title-input')).toHaveValue('Detail task')
  } finally {
    await closeApp(app, dir, container)
  }
})

test('daily-plan: pane ⋯ Mark done while in the task worktree offers to remove it → folder deleted', async () => {
  const { container, repo } = makeRepo()
  // a real worktree whose branch == the task's issue key (offerDeleteTaskWorktree
  // matches the worktree to the task by issueKey -> branch).
  const wtPath = join(container, 'worktrees', 'CRF-1')
  mkdirSync(join(container, 'worktrees'), { recursive: true })
  execSync(`git worktree add "${wtPath}" -b CRF-1 main`, { cwd: repo, env: gitEnv() })
  const dir = freshStateDir('crafterm-e2e-dpas-')
  const tab = boundTab('seed-1')
  tab.root.cwd = wtPath // the pane lives inside the worktree
  seedState(dir, repo, [task({ id: 'seed-1', title: 'WT done task', projectId: 'p-test', issueKey: 'CRF-1', status: 'wip' })], {
    tab,
    supportWorktree: true
  })
  const { app, win } = await launchApp(dir)
  try {
    // wait for the worktree node to reconcile so offerDeleteTaskWorktree can find it
    await expect.poll(() => worktreeNodes(dir).some((w) => w.branch === 'CRF-1'), { timeout: 30_000 }).toBe(true)
    await selectTab(win, 'CRF-1') // the seeded tab restores unselected; activate it
    await expect(win.locator('.pane-box .pane-daily-chip', { hasText: 'CRF-1' })).toBeVisible({ timeout: 10_000 })

    await (await openPaneMenu(win)).getByRole('button', { name: 'Mark as done', exact: true }).click()
    // the task is marked done...
    await expect.poll(() => taskOnDisk(dir, 'seed-1')?.status === 'done', { timeout: 10_000 }).toBe(true)
    // ...and a "Remove worktree" confirm is offered; confirming deletes the folder + archives the node.
    const confirm = win.locator('.modal-overlay')
    await expect(confirm).toBeVisible({ timeout: 10_000 })
    await expect(confirm).toContainText('Remove worktree')
    await confirm.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect.poll(() => !existsSync(wtPath), { timeout: 30_000 }).toBe(true)
    await expect
      .poll(() => worktreeNodes(dir).find((w) => w.branch === 'CRF-1')?.status === 'archived', { timeout: 30_000 })
      .toBe(true)
  } finally {
    await closeApp(app, dir, container)
  }
})

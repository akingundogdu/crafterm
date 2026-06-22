import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, realpathSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

// The user's end-to-end daily-task worktree story (§8.7 / §8.8 / §2 Claude resume):
// (1) create a NEW task from the board, pick its project + a WORKTREE SLUG, and run
// it in worktree mode → a `CRF-N-slug` git worktree + a Claude session seeded with
// the task title, task → In Progress; (2) move the task review → test, close+reopen
// the app → the session resumes (`claude --resume`) and the task keeps its status +
// chip. (The close → modal → delete → task-done half is in worktree-close-actions.)
// Backed by a real throwaway git repo; HR-5: throwaway state dir only.

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
function makeRepo(): { container: string; repo: string } {
  const container = realpathSync(mkdtempSync(join(tmpdir(), 'crafterm-e2e-dtws-')))
  const repo = join(container, 'repo')
  mkdirSync(repo, { recursive: true })
  execSync('git init -b main', { cwd: repo, env: gitEnv() })
  execSync('git commit --allow-empty -m init', { cwd: repo, env: gitEnv() })
  return { container, repo }
}
function freshStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-dtwss-'))
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
// Every layout leaf from every tab at ANY depth (run-in-worktree nests the tab).
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
// Claude JSONL fixture in an isolated projects dir (CRAFTERM_CLAUDE_DIR), mirroring
// claude-session.spec — so a restored session has a record to resume.
function encodeCwd(cwd: string): string {
  return cwd.replace(/[/.]/g, '-')
}
function writeFixture(claudeDir: string, cwd: string, sessionId: string, lines: object[]): void {
  mkdirSync(join(claudeDir, encodeCwd(cwd)), { recursive: true })
  writeFileSync(join(claudeDir, encodeCwd(cwd), sessionId + '.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
}
async function launch(dir: string, claudeDir?: string): Promise<{ app: ElectronApplication; win: Page }> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>), CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: dir }
  if (claudeDir) env.CRAFTERM_CLAUDE_DIR = claudeDir
  const app = await electron.launch({ args: ['.'], env })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
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

test('daily-task: new task from the board → project + worktree slug → Run in worktree creates CRF-N-slug + Claude session', async () => {
  const { container, repo } = makeRepo()
  const dir = freshStateDir()
  // seed ONLY the project; the task is created in the form so the new-task path
  // (commit() + assignIssueKey + slug) is exercised end-to-end.
  writeFileSync(
    join(dir, 'crafterm-state.json'),
    JSON.stringify({
      schemaVersion: 4,
      tree: [
        { kind: 'project', id: 'p-test', name: 'Repo', color: null, collapsed: false, pinned: false, children: [], path: repo, issueKeyPrefix: 'CRF', supportWorktree: true }
      ],
      dailyPlan: { tasks: [], tags: [] }
    })
  )
  const { app, win } = await launch(dir)
  try {
    const board = await openBoard(win)
    await board.getByRole('button', { name: '+ New task' }).click()
    const form = win.locator('.daily-plan-form-overlay')
    await expect(form).toBeVisible()

    await form.locator('.daily-plan-title-input').fill('Slugged WT task')
    await form.locator('.daily-plan-form select').first().selectOption({ label: 'Repo (CRF)' }) // Project select
    await form.getByPlaceholder('e.g. fix-login').fill('Fix Login!') // sanitizes -> fix-login
    // two .daily-plan-proj-hint exist (project path + worktree preview); target the latter.
    await expect(form.locator('.daily-plan-proj-hint', { hasText: 'Worktree' })).toContainText('CRF-#-fix-login')

    await form.getByRole('button', { name: /Run in worktree/ }).click()

    // branch = issueKey + sanitized slug; the worktree exists on disk
    await expect.poll(() => worktreeNodes(dir).some((w) => w.branch === 'CRF-1-fix-login'), { timeout: 30_000 }).toBe(true)
    const node = worktreeNodes(dir).find((w) => w.branch === 'CRF-1-fix-login')
    expect(Boolean(node?.worktreePath && existsSync(node.worktreePath))).toBe(true)
    // the new task persisted with its slug + auto issue key + In Progress
    await expect
      .poll(
        () => {
          const t = (readState(dir)?.dailyPlan?.tasks ?? [])[0]
          return t?.worktreeSlug === 'fix-login' && t?.issueKey === 'CRF-1' && t?.status === 'wip'
        },
        { timeout: 15_000 }
      )
      .toBe(true)
    // a Claude session opened at the worktree cwd, title-bound to the task
    await expect(win.locator('.pane-box.active .pane-status-seg.worktree')).toBeVisible({ timeout: 20_000 })
    await expect(win.locator('.pane-box.active .pane-daily-chip', { hasText: 'CRF-1' })).toBeVisible({ timeout: 10_000 })
    await expect(win.locator('.pane-box.active .xterm-rows')).toContainText('ultrathink', { timeout: 15_000 })
    await expect.poll(() => leaves(dir).some((l) => l.tickets?.length === 1), { timeout: 10_000 }).toBe(true)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
    rmSync(container, { recursive: true, force: true })
  }
})

test('daily-task: after review→test, close+reopen resumes the session and keeps the test status + chip', async () => {
  const { container, repo } = makeRepo()
  const dir = freshStateDir()
  const claudeDir = join(dir, 'claude')
  const SID = 'aaaaaaaa-bbbb-4ccc-8ddd-000000000050'
  const TASK_ID = 'resume-task-1'
  // a Claude pane bound to a task (tickets), task starts in progress (wip)
  writeFileSync(
    join(dir, 'crafterm-state.json'),
    JSON.stringify({
      schemaVersion: 4,
      tree: [
        { kind: 'project', id: 'p-test', name: 'Repo', color: null, collapsed: false, pinned: false, children: [], path: repo, issueKeyPrefix: 'CRF' },
        {
          kind: 'tab', title: 'CRF-1', titleLocked: true, color: null, pinned: false, status: 'idle',
          root: { type: 'leaf', stableId: SID, cwd: repo, claude: true, claudeSessionId: SID, projectId: 'p-test', tickets: [TASK_ID] }
        }
      ],
      dailyPlan: { tags: [], tasks: [task({ id: TASK_ID, title: 'Resuming task', issueKey: 'CRF-1', status: 'wip' })] }
    })
  )
  writeFixture(claudeDir, repo, SID, [{ type: 'user', message: { role: 'user', content: 'hi' } }])

  let app: ElectronApplication
  let win: Page
  ;({ app, win } = await launch(dir, claudeDir))
  try {
    await expect(win.locator('.pane-box .pane-daily-chip', { hasText: 'CRF-1' })).toBeVisible({ timeout: 12_000 })

    // drive review -> test via the pane menu (re-open the menu each time)
    await (await openPaneMenu(win)).getByRole('button', { name: 'Mark as code review', exact: true }).click()
    await expect.poll(() => taskOnDisk(dir, TASK_ID)?.status === 'review', { timeout: 10_000 }).toBe(true)
    await (await openPaneMenu(win)).getByRole('button', { name: 'Mark as test', exact: true }).click()
    await expect.poll(() => taskOnDisk(dir, TASK_ID)?.status === 'test', { timeout: 10_000 }).toBe(true)

    // close + reopen the same state dir
    await app.close()
    ;({ app, win } = await launch(dir, claudeDir))

    // the session resumes where it left off (claude --resume <id> echoed into the xterm)
    await expect(win.locator('.pane-box .xterm-rows')).toContainText(`claude --resume ${SID}`, { timeout: 15_000 })
    // the task status continues from the last status (test), and the pane re-binds (chip restored)
    await expect.poll(() => taskOnDisk(dir, TASK_ID)?.status === 'test', { timeout: 10_000 }).toBe(true)
    await expect(win.locator('.pane-box .pane-daily-chip', { hasText: 'CRF-1' })).toBeVisible({ timeout: 12_000 })
    await expect.poll(() => leaves(dir).some((l) => l.tickets?.[0] === TASK_ID), { timeout: 10_000 }).toBe(true)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
    rmSync(container, { recursive: true, force: true })
  }
})

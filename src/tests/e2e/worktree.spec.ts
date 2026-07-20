import { test, expect } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { freshStateDir, launchApp, selectTab, readState, closeApp } from './_harness.js'

// Git worktree management (§3): create via the New-worktree modal (hidden
// `git worktree add` → reconcile materializes the node), remove → archived; plus
// a Claude session + the worktree status-bar segment in a real worktree pane.
// Backed by a throwaway git repo. HR-5: throwaway state dir only.

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
  const container = mkdtempSync(join(tmpdir(), 'crafterm-e2e-wt-'))
  const repo = join(container, 'repo')
  mkdirSync(repo, { recursive: true })
  execSync('git init -b main', { cwd: repo, env: gitEnv() })
  execSync('git commit --allow-empty -m init', { cwd: repo, env: gitEnv() })
  return { container, repo }
}
function worktreeNodes(dir: string): any[] {
  const walk = (nodes: any[]): any[] =>
    (nodes ?? []).flatMap((n) => (n.kind === 'worktree' ? [n, ...walk(n.children)] : walk(n.children)))
  return walk(readState(dir)?.tree ?? [])
}
function seedProject(stateDir: string, repo: string): void {
  const seed = {
    schemaVersion: 4,
    tree: [
      {
        kind: 'project',
        id: 'p-test',
        name: 'Repo',
        color: null,
        collapsed: false,
        pinned: false,
        children: [],
        path: repo,
        supportWorktree: true
      }
    ]
  }
  writeFileSync(join(stateDir, 'crafterm-state.json'), JSON.stringify(seed))
}
function seedClaudeLeaf(stateDir: string, cwd: string, sessionId: string): void {
  const seed = {
    schemaVersion: 4,
    tree: [
      {
        kind: 'tab',
        title: 'Claude',
        titleLocked: false,
        color: null,
        pinned: false,
        status: 'idle',
        root: { type: 'leaf', stableId: 'aaaaaaaa-bbbb-4ccc-8ddd-ffffffffffff', cwd, claude: true, claudeSessionId: sessionId }
      }
    ]
  }
  writeFileSync(join(stateDir, 'crafterm-state.json'), JSON.stringify(seed))
}
function encodeCwd(cwd: string): string {
  return cwd.replace(/[/.]/g, '-')
}
function writeFixture(claudeDir: string, cwd: string, sessionId: string, lines: object[]): void {
  mkdirSync(join(claudeDir, encodeCwd(cwd)), { recursive: true })
  writeFileSync(join(claudeDir, encodeCwd(cwd), sessionId + '.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
}

test('worktree: create via the New-worktree modal, then remove archives it', async () => {
  const { container, repo } = makeRepo()
  const dir = freshStateDir('crafterm-e2e-wts-')
  seedProject(dir, repo)
  const { app, win } = await launchApp(dir)
  try {
    // the seeded project reconciles on load and auto-creates the "worktrees" container
    const wtContainer = win.locator('#tab-list .tab-item', { hasText: 'worktrees' }).first()
    await expect(wtContainer).toBeVisible({ timeout: 15_000 })

    await test.step('create a worktree via the modal', async () => {
      await wtContainer.click({ button: 'right' })
      await win.locator('.context-menu').getByRole('button', { name: /New worktree/ }).click()
      const modal = win.locator('.modal-overlay')
      await expect(modal).toBeVisible()
      await modal.locator('input').first().fill('featx') // branch; base stays "main"
      await modal.locator('.modal-actions button.button-primary').click()
      await expect
        .poll(() => worktreeNodes(dir).some((w) => w.branch === 'featx'), { timeout: 30_000 })
        .toBe(true)
    })

    await test.step('remove the worktree → archived (kept, not deleted)', async () => {
      const wtRow = win.locator('#tab-list .tab-item', { hasText: 'featx' }).first()
      await wtRow.click({ button: 'right' })
      await win.locator('.context-menu').getByRole('button', { name: 'Delete worktree', exact: true }).click()
      await win.locator('.modal-overlay .modal-actions button.button-primary').click() // "Remove"
      await expect
        .poll(() => worktreeNodes(dir).find((w) => w.branch === 'featx')?.status === 'archived', { timeout: 30_000 })
        .toBe(true)
    })
  } finally {
    await closeApp(app, dir, container)
  }
})

test('worktree: a claude session + the worktree status segment work in a worktree pane', async () => {
  const { container, repo } = makeRepo()
  const wtPath = join(container, 'worktrees', 'wt-claude')
  mkdirSync(join(container, 'worktrees'), { recursive: true })
  execSync(`git worktree add "${wtPath}" -b wt-claude main`, { cwd: repo, env: gitEnv() })
  // macOS tmpdir is under /var -> /private/var; the pane reports the canonical
  // cwd, so encode the realpath to match the JSONL fixture dir.
  const wtReal = realpathSync(wtPath)

  const dir = freshStateDir('crafterm-e2e-wts-')
  const claudeDir = join(dir, 'claude')
  const U = 'aaaaaaaa-bbbb-4ccc-8ddd-000000000010'
  seedClaudeLeaf(dir, wtReal, U)
  writeFixture(claudeDir, wtReal, U, [
    { type: 'user', message: { role: 'user', content: 'hi' } },
    { type: 'custom-title', customTitle: 'WT Claude' }
  ])
  const { app, win } = await launchApp(dir, { CRAFTERM_CLAUDE_DIR: claudeDir })
  try {
    await selectTab(win, 'Claude') // the seeded tab restores unselected; activate it
    await test.step('claude title binds at the worktree cwd', async () => {
      await expect(win.locator('.pane-box .pane-title', { hasText: 'WT Claude' })).toBeVisible({ timeout: 12_000 })
    })
    await test.step('the status bar shows the worktree segment', async () => {
      await expect(win.locator('.pane-box.active .pane-status-seg.worktree')).toBeVisible({ timeout: 15_000 })
    })
  } finally {
    await closeApp(app, dir, container)
  }
})

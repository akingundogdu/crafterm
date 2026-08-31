import { test, expect } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { freshStateDir, launchApp, readState, closeApp } from './_harness.js'

// Worktree setup scripts (§3): the pre/post shell commands configured in Settings
// run around `run-create-worktree` in the terminal, and each reports itself back
// over an OSC step marker so the progress overlay lists it by name and shows it
// running → done. Exercises the real shell + xterm path end to end.

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
  const container = mkdtempSync(join(tmpdir(), 'crafterm-e2e-wtsx-'))
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

// One global pre script and one project-level post script. Both touch a file, so
// the test can prove they ran and where; the post one sleeps first so the overlay
// can be caught mid-run — that's the state the spinner reports.
function seedProject(stateDir: string, repo: string): void {
  const seed = {
    schemaVersion: 4,
    worktreeScripts: {
      pre: [{ id: 'g1', name: 'Global pre step', command: 'touch {repoRoot}/pre-ran' }],
      post: []
    },
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
        supportWorktree: true,
        worktreeScripts: {
          pre: [],
          post: [{ id: 'p1', name: 'Project post step', command: 'sleep 4 ; touch post-ran' }]
        }
      }
    ]
  }
  writeFileSync(join(stateDir, 'crafterm-state.json'), JSON.stringify(seed))
}

// A real shell + a real `git worktree add` + a deliberately slow setup script:
// more than the default per-test budget allows.
test.setTimeout(150_000)

test('worktree scripts: run around the creation and report their state live', async () => {
  const { container, repo } = makeRepo()
  const dir = freshStateDir('crafterm-e2e-wtsx-')
  seedProject(dir, repo)
  const { app, win } = await launchApp(dir)
  try {
    const wtContainer = win.locator('#tab-list .tab-item', { hasText: 'worktrees' }).first()
    await expect(wtContainer).toBeVisible({ timeout: 15_000 })

    const steps = win.locator('.worktree-progress-step')
    const postRow = steps.filter({ hasText: 'Project post step' })

    await test.step('the overlay lists both scripts by name, with their commands', async () => {
      await wtContainer.click({ button: 'right' })
      await win.locator('.context-menu').getByRole('button', { name: /New worktree/ }).click()
      const modal = win.locator('.modal-overlay')
      await expect(modal).toBeVisible()
      await modal.locator('input').first().fill('featx')
      await modal.locator('.modal-actions button.button-primary').click()

      await expect(steps.filter({ hasText: 'Global pre step' })).toBeVisible({ timeout: 15_000 })
      await expect(postRow).toBeVisible()
      await expect(win.locator('.worktree-progress-detail', { hasText: 'touch post-ran' })).toBeVisible()
    })

    await test.step('the slow post script reads as running while the earlier steps are done', async () => {
      // Driven by the shell's own markers, not a timer: the row goes active only
      // once the script has actually started.
      await expect(postRow).toHaveClass(/active/, { timeout: 60_000 })
      await expect(steps.filter({ hasText: 'Global pre step' })).toHaveClass(/done/)
      await expect(steps.filter({ hasText: 'Creating the worktree' })).toHaveClass(/done/)
    })

    await test.step('the overlay closes once the last script reports done', async () => {
      await expect(win.locator('.worktree-progress')).toBeHidden({ timeout: 60_000 })
    })

    await test.step('the scripts really ran, in the right directories', async () => {
      // pre runs in the repo root (before the worktree exists), post inside the
      // new worktree.
      expect(existsSync(join(repo, 'pre-ran'))).toBe(true)
      expect(existsSync(join(container, 'worktrees', 'featx', 'post-ran'))).toBe(true)
      expect(worktreeNodes(dir).some((w) => w.branch === 'featx')).toBe(true)
    })
  } finally {
    await closeApp(app, dir, container)
  }
})

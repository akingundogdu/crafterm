import { test, expect } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { freshStateDir, launchApp, closeApp } from '../_harness.js'

// Background-process panes (§2): a worktree's "Run in background…" starts a hidden
// PTY; clicking its sidebar sub-row opens a view whose xterm is seeded by the
// replayed buffer; closing the view keeps the process alive (view ≠ kill).
// Needs a real git worktree (the menu item is worktree-scoped). HR-5: throwaway.

function gitEnv(): NodeJS.ProcessEnv {
  return { ...process.env, GIT_AUTHOR_NAME: 'e2e', GIT_AUTHOR_EMAIL: 'e2e@test', GIT_COMMITTER_NAME: 'e2e', GIT_COMMITTER_EMAIL: 'e2e@test' }
}
function makeRepo(): { container: string; repo: string } {
  const container = mkdtempSync(join(tmpdir(), 'crafterm-e2e-bgwt-'))
  const repo = join(container, 'repo')
  mkdirSync(repo, { recursive: true })
  execSync('git init -b main', { cwd: repo, env: gitEnv() })
  execSync('git commit --allow-empty -m init', { cwd: repo, env: gitEnv() })
  return { container, repo }
}
function seedProject(stateDir: string, repo: string): void {
  writeFileSync(
    join(stateDir, 'crafterm-state.json'),
    JSON.stringify({
      schemaVersion: 4,
      tree: [{ kind: 'project', id: 'p-bg', name: 'Repo', color: null, collapsed: false, pinned: false, children: [], path: repo, supportWorktree: true }]
    })
  )
}

test('background process: run-in-background → view replays the buffer → close keeps it', async () => {
  const { container, repo } = makeRepo()
  const dir = freshStateDir('crafterm-e2e-bg-')
  seedProject(dir, repo)
  const { app, win } = await launchApp(dir)
  try {
    // create a worktree via the modal (the proven worktree.spec path)
    const wtContainer = win.locator('#tab-list .tab-item', { hasText: 'worktrees' }).first()
    await expect(wtContainer).toBeVisible({ timeout: 15_000 })
    await wtContainer.click({ button: 'right' })
    await win.locator('.context-menu').getByRole('button', { name: /New worktree/ }).click()
    let modal = win.locator('.modal-overlay')
    await modal.locator('input').first().fill('bgwt')
    await modal.locator('.modal-actions button.button-primary').click()
    // wait for the node to fully reconcile into a worktree (gets `.worktree-icon`);
    // until then it transiently renders as a plain folder with the folder menu.
    const wtRow = win.locator('#tab-list .tab-item:has(.worktree-icon)', { hasText: 'bgwt' })
    await expect(wtRow).toBeVisible({ timeout: 30_000 })

    await test.step('Run in background → a process sub-row appears', async () => {
      await wtRow.click({ button: 'right' })
      await win.locator('.context-menu').getByRole('button', { name: /Run in background/ }).click()
      modal = win.locator('.modal-overlay')
      await modal.locator('input').first().fill('echo BGTOKEN; sleep 30')
      await modal.locator('.modal-actions button.button-primary').click()
      await expect(win.locator('#tab-list .tab-pane-row', { hasText: 'BGTOKEN' })).toBeVisible({ timeout: 10_000 })
    })

    await test.step('viewing it replays the buffer into a new xterm', async () => {
      await win.locator('#tab-list .tab-pane-row', { hasText: 'BGTOKEN' }).click()
      await expect(win.locator('.pane-box.active .pane-term .xterm-rows')).toContainText('BGTOKEN', { timeout: 10_000 })
    })

    await test.step('closing the view keeps the process alive (view ≠ kill)', async () => {
      await win.locator('.pane-box.active .pane-close').click()
      await expect(win.locator('#tab-list .tab-pane-row', { hasText: 'BGTOKEN' })).toBeVisible()
    })
  } finally {
    await closeApp(app, dir, container)
  }
})

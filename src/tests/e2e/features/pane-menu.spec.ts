import { test, expect, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { freshStateDir, launchApp, selectTab, closeApp } from '../_harness.js'

// Pane "⋯" menu actions (§2.31/§2.32/§2.33): git quick-actions, the project/app
// command sections, and SSH items — each types its command into the SAME pane's
// PTY (not a new split). Asserted via the rendered xterm echo. Real throwaway git
// repo so the pane reports a canonical cwd. HR-5: throwaway state dir only.

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
  const container = realpathSync(mkdtempSync(join(tmpdir(), 'crafterm-e2e-pm-')))
  const repo = join(container, 'repo')
  mkdirSync(repo, { recursive: true })
  execSync('git init -b main', { cwd: repo, env: gitEnv() })
  execSync('git commit --allow-empty -m init', { cwd: repo, env: gitEnv() })
  return { container, repo }
}
function writeState(dir: string, state: Record<string, any>): void {
  writeFileSync(join(dir, 'crafterm-state.json'), JSON.stringify({ schemaVersion: 4, ...state }))
}
function termTab(cwd: string, leafExtra?: Record<string, any>): Record<string, any> {
  return {
    kind: 'tab', title: 'Term', titleLocked: false, color: null, pinned: false, status: 'idle',
    root: { type: 'leaf', stableId: 'aaaaaaaa-bbbb-4ccc-8ddd-000000000041', cwd, ...leafExtra }
  }
}
async function openPaneMenu(win: Page): Promise<ReturnType<Page['locator']>> {
  await selectTab(win, 'Term') // the seeded tab restores unselected; activate it
  await win.locator('.pane-box .pane-btn').first().click()
  const menu = win.locator('.context-menu')
  await expect(menu).toBeVisible()
  return menu
}

test('pane-menu: git quick-action Pull runs `git pull` in the same pane', async () => {
  const { container, repo } = makeRepo()
  const dir = freshStateDir('crafterm-e2e-pms-')
  writeState(dir, { tree: [termTab(repo)] })
  const { app, win } = await launchApp(dir)
  try {
    await (await openPaneMenu(win)).getByRole('button', { name: 'Pull', exact: true }).click()
    await expect(win.locator('.pane-box.active .xterm-rows')).toContainText('git pull', { timeout: 12_000 })
    await expect(win.locator('.pane-box')).toHaveCount(1) // same pane, not a new split
  } finally {
    await closeApp(app, dir, container)
  }
})

test('pane-menu: a project run-command section types the command into the pane', async () => {
  const { container, repo } = makeRepo()
  const dir = freshStateDir('crafterm-e2e-pms-')
  writeState(dir, {
    tree: [
      {
        kind: 'project', id: 'p-test', name: 'Repo', color: null, collapsed: false, pinned: false, children: [],
        path: repo, runCommands: [{ id: 'rc1', name: 'Dev server', command: 'echo crafterm-dev-cmd' }]
      },
      termTab(repo, { projectId: 'p-test' })
    ]
  })
  const { app, win } = await launchApp(dir)
  try {
    const menu = await openPaneMenu(win)
    await expect(menu.locator('.context-menu-label', { hasText: 'Commands — Repo' })).toBeVisible()
    await menu.getByRole('button', { name: 'Dev server', exact: true }).click()
    await expect(win.locator('.pane-box.active .xterm-rows')).toContainText('crafterm-dev-cmd', { timeout: 12_000 })
  } finally {
    await closeApp(app, dir, container)
  }
})

test('pane-menu: an SSH item types its ssh command into the pane', async () => {
  const { container, repo } = makeRepo()
  const dir = freshStateDir('crafterm-e2e-pms-')
  writeState(dir, {
    sshConnections: [{ id: 'ssh1', label: 'My box', host: 'ex.invalid', user: 'u', port: 2222 }],
    tree: [termTab(repo)]
  })
  const { app, win } = await launchApp(dir)
  try {
    const menu = await openPaneMenu(win)
    await expect(menu.locator('.context-menu-label', { hasText: 'SSH' })).toBeVisible()
    await menu.getByRole('button', { name: 'My box', exact: true }).click()
    await expect(win.locator('.pane-box.active .xterm-rows')).toContainText('ssh -p 2222 u@ex.invalid', { timeout: 12_000 })
    await expect(win.locator('.pane-box')).toHaveCount(1) // typed into the current PTY, not a new terminal
  } finally {
    await closeApp(app, dir, container)
  }
})

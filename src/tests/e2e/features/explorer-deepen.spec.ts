import { test, expect } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { freshStateDir, launchApp, closeApp } from '../_harness.js'

// Explorer (Files tab) deepen (§6): search flattens, the context menu creates a
// file on disk, and clicking a code file opens the Monaco editor. The explorer is
// rooted at a temp dir via the top-level `explorerRoot` setting (no terminal pane
// overrides it since the starter cwd isn't a worktree). HR-5: throwaway dir only.

function makeFiles(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'crafterm-e2e-exsrc-'))
  for (const [name, content] of Object.entries(files)) {
    const p = join(root, name)
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, content)
  }
  return root
}
function seedExplorerRoot(stateDir: string, root: string): void {
  writeFileSync(join(stateDir, 'crafterm-state.json'), JSON.stringify({ schemaVersion: 4, explorerRoot: root }))
}

test('explorer: search flattens to the matching file', async () => {
  const src = makeFiles({ 'alpha.ts': 'a', 'beta.ts': 'b' })
  const dir = freshStateDir('crafterm-e2e-exp-')
  seedExplorerRoot(dir, src)
  const { app, win } = await launchApp(dir)
  try {
    await win.locator('#notif-tab-files').click()
    await expect(win.locator('#explorer-tree')).toContainText('alpha.ts', { timeout: 10_000 })
    await win.locator('#explorer-search').fill('alpha')
    await expect(win.locator('#explorer-tree .explorer-row')).toHaveCount(1, { timeout: 5_000 })
    await expect(win.locator('#explorer-tree .explorer-name')).toHaveText('alpha.ts')
  } finally {
    await closeApp(app, dir, src)
  }
})

test('explorer: context-menu New File creates it on disk + in the tree', async () => {
  const src = makeFiles({ 'sub/keep.ts': 'x' })
  const dir = freshStateDir('crafterm-e2e-exp-')
  seedExplorerRoot(dir, src)
  const { app, win } = await launchApp(dir)
  try {
    await win.locator('#notif-tab-files').click()
    const subRow = win.locator('#explorer-tree .tab-item.folder', { hasText: 'sub' })
    await expect(subRow).toBeVisible({ timeout: 10_000 })
    await subRow.click({ button: 'right' })
    await win.locator('.context-menu').getByRole('button', { name: /New File/ }).click()
    const modal = win.locator('.modal.modal-prompt')
    await expect(modal).toBeVisible()
    await modal.locator('input').first().fill('created.ts')
    await modal.getByRole('button', { name: 'Create', exact: true }).click()
    // created on disk, and newFile opens it → a code pane mounts for created.ts
    await expect.poll(() => existsSync(join(src, 'sub', 'created.ts')), { timeout: 5_000 }).toBe(true)
    await expect(win.locator('.pane-box.code-pane .diff-path')).toHaveAttribute('title', /created\.ts$/, { timeout: 8_000 })
  } finally {
    await closeApp(app, dir, src)
  }
})

test('explorer: clicking a code file opens the Monaco editor', async () => {
  const src = makeFiles({ 'foo.ts': 'const x = 1\n' })
  const dir = freshStateDir('crafterm-e2e-exp-')
  seedExplorerRoot(dir, src)
  const { app, win } = await launchApp(dir)
  try {
    await win.locator('#notif-tab-files').click()
    await win.locator('#explorer-tree').getByText('foo.ts', { exact: true }).click()
    await expect(win.locator('.pane-box.code-pane')).toBeVisible({ timeout: 10_000 })
    await expect(win.locator('.pane-box.code-pane .diff-path')).toHaveAttribute('title', /foo\.ts$/)
  } finally {
    await closeApp(app, dir, src)
  }
})

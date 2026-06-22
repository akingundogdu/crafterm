import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Explorer (Files tab) deepen (§6): search flattens, the context menu creates a
// file on disk, and clicking a code file opens the Monaco editor. The explorer is
// rooted at a temp dir via the top-level `explorerRoot` setting (no terminal pane
// overrides it since the starter cwd isn't a worktree). HR-5: throwaway dir only.

function freshStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-exp-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(dir)) throw new Error('HR-5 violated: refusing real state dir')
  return dir
}
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
async function launch(dir: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: dir } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}

test('explorer: search flattens to the matching file', async () => {
  const src = makeFiles({ 'alpha.ts': 'a', 'beta.ts': 'b' })
  const dir = freshStateDir()
  seedExplorerRoot(dir, src)
  const { app, win } = await launch(dir)
  try {
    await win.locator('#notif-tab-files').click()
    await expect(win.locator('#explorer-tree')).toContainText('alpha.ts', { timeout: 10_000 })
    await win.locator('#explorer-search').fill('alpha')
    await expect(win.locator('#explorer-tree .explorer-row')).toHaveCount(1, { timeout: 5_000 })
    await expect(win.locator('#explorer-tree .explorer-name')).toHaveText('alpha.ts')
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
    rmSync(src, { recursive: true, force: true })
  }
})

test('explorer: context-menu New File creates it on disk + in the tree', async () => {
  const src = makeFiles({ 'sub/keep.ts': 'x' })
  const dir = freshStateDir()
  seedExplorerRoot(dir, src)
  const { app, win } = await launch(dir)
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
    await app.close()
    rmSync(dir, { recursive: true, force: true })
    rmSync(src, { recursive: true, force: true })
  }
})

test('explorer: clicking a code file opens the Monaco editor', async () => {
  const src = makeFiles({ 'foo.ts': 'const x = 1\n' })
  const dir = freshStateDir()
  seedExplorerRoot(dir, src)
  const { app, win } = await launch(dir)
  try {
    await win.locator('#notif-tab-files').click()
    await win.locator('#explorer-tree').getByText('foo.ts', { exact: true }).click()
    await expect(win.locator('.pane-box.code-pane')).toBeVisible({ timeout: 10_000 })
    await expect(win.locator('.pane-box.code-pane .diff-path')).toHaveAttribute('title', /foo\.ts$/)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
    rmSync(src, { recursive: true, force: true })
  }
})

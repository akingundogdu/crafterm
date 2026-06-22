import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Doc pane (§2): open a markdown file from the Files tab → it renders; Edit shows
// a textarea with the raw markdown; Cmd+S writes back to disk (stays in edit).
// Opened via the explorer (no seedable doc leaf). HR-5: throwaway dir only.

function freshStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-doc-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(dir)) throw new Error('HR-5 violated: refusing real state dir')
  return dir
}
function makeDocDir(): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-docsrc-'))
  const file = join(dir, 'note.md')
  writeFileSync(file, '# Hello\n\nbody\n')
  return { dir, file }
}
function seedExplorerRoot(stateDir: string, root: string): void {
  writeFileSync(join(stateDir, 'crafterm-state.json'), JSON.stringify({ schemaVersion: 4, tree: [], explorerRoot: root }))
}
async function launch(dir: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: dir } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}

test('doc-pane: markdown renders → Edit shows the textarea → Cmd+S writes to disk', async () => {
  const { dir: src, file } = makeDocDir()
  const stateDir = freshStateDir()
  seedExplorerRoot(stateDir, src)
  const { app, win } = await launch(stateDir)
  try {
    await win.locator('#notif-tab-files').click()
    await win.locator('#explorer-tree').getByText('note.md', { exact: true }).click()

    const pane = win.locator('.pane-box.doc-pane')
    await expect(pane).toBeVisible({ timeout: 15_000 })
    await expect(pane.locator('.doc-preview h1')).toHaveText('Hello', { timeout: 10_000 })

    await test.step('Edit → textarea with the raw markdown', async () => {
      await pane.getByRole('button', { name: 'Edit', exact: true }).click()
      const ta = pane.locator('textarea.doc-editor')
      await expect(ta).toBeVisible()
      await expect(ta).toHaveValue(/# Hello/)
      await expect(pane.getByRole('button', { name: 'Preview', exact: true })).toBeVisible() // label flipped
    })

    await test.step('edit + Cmd+S writes to disk (stays in edit mode)', async () => {
      const ta = pane.locator('textarea.doc-editor')
      await ta.click()
      await win.keyboard.press('End')
      await win.keyboard.type('\nEDIT_TOKEN\n')
      await win.keyboard.press('Meta+s')
      await expect.poll(() => readFileSync(file, 'utf8').includes('EDIT_TOKEN'), { timeout: 5_000 }).toBe(true)
      await expect(pane.getByRole('button', { name: 'Preview', exact: true })).toBeVisible() // still editing
    })
  } finally {
    await app.close()
    rmSync(src, { recursive: true, force: true })
    rmSync(stateDir, { recursive: true, force: true })
  }
})

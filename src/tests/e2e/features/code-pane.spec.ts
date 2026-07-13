import { test, expect } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { freshStateDir, launchApp, closeApp } from '../_harness.js'

// Monaco code editor pane (§2), seeded deterministically via a `codePane` leaf
// pointing at a real temp file. Covers open→edit→dirty→Cmd+S(disk) and Cmd+click
// import resolution into the reused pane. HR-5: throwaway state dir only.

function makeFiles(files: Record<string, string>): string {
  const container = mkdtempSync(join(tmpdir(), 'crafterm-e2e-src-'))
  for (const [name, content] of Object.entries(files)) {
    const p = join(container, name)
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, content)
  }
  return container
}
function seedCodePane(stateDir: string, filePath: string, explorerRoot?: string): void {
  const seed: Record<string, any> = {
    schemaVersion: 4,
    tree: [
      {
        kind: 'tab',
        title: 'Code',
        titleLocked: false,
        color: null,
        pinned: false,
        status: 'idle',
        root: { type: 'leaf', stableId: 'aaaaaaaa-bbbb-4ccc-8ddd-cccccccccccc', codePane: { path: filePath } }
      }
    ]
  }
  if (explorerRoot) seed.explorerRoot = explorerRoot
  writeFileSync(join(stateDir, 'crafterm-state.json'), JSON.stringify(seed))
}

test('code-pane: open a file → Monaco mounts; edit → dirty; Cmd+S writes to disk', async () => {
  const src = makeFiles({ 'a.ts': 'const x = 1\n' })
  const file = join(src, 'a.ts')
  const dir = freshStateDir('crafterm-e2e-code-')
  seedCodePane(dir, file)
  const { app, win } = await launchApp(dir)
  try {
    const pane = win.locator('.pane-box.code-pane')
    await expect(pane).toBeVisible({ timeout: 15_000 })
    await expect(pane.locator('.code-body .monaco-editor')).toBeVisible({ timeout: 10_000 })
    await expect(pane.locator('.diff-path')).toHaveAttribute('title', /a\.ts$/)

    await test.step('typing marks the pane dirty', async () => {
      await pane.locator('.monaco-editor').click()
      await win.keyboard.type('// EDIT_TOKEN\n')
      await expect(pane.locator('.code-editor-unsaved-dot')).toBeVisible()
    })

    await test.step('Cmd+S saves to disk + clears the dirty dot', async () => {
      await win.keyboard.press('Meta+s')
      await expect(pane.locator('.code-editor-unsaved-dot')).toBeHidden({ timeout: 10_000 })
      await expect.poll(() => readFileSync(file, 'utf8').includes('EDIT_TOKEN'), { timeout: 5_000 }).toBe(true)
    })
  } finally {
    await closeApp(app, src, dir)
  }
})

test('code-pane: opening another file from the explorer reuses the same pane', async () => {
  const src = makeFiles({ 'a.ts': 'const a = 1\n', 'b.ts': 'const b = 2\n' })
  const dir = freshStateDir('crafterm-e2e-code-')
  // seed the code pane on a.ts + root the explorer at the temp src dir (no terminal
  // pane exists, so explorerRoot() falls through to settings.explorerRoot).
  seedCodePane(dir, join(src, 'a.ts'), src)
  const { app, win } = await launchApp(dir)
  try {
    const pane = win.locator('.pane-box.code-pane')
    await expect(pane.locator('.diff-path')).toHaveAttribute('title', /a\.ts$/, { timeout: 15_000 })
    await expect(win.locator('.pane-box.code-pane')).toHaveCount(1)

    await test.step('click b.ts in the Files tab → reuses the pane', async () => {
      await win.locator('#notif-tab-files').click()
      await win.locator('#explorer-tree').getByText('b.ts', { exact: true }).click()
      await expect(pane.locator('.diff-path')).toHaveAttribute('title', /b\.ts$/, { timeout: 12_000 })
      await expect(win.locator('.pane-box.code-pane')).toHaveCount(1) // reused, not a new pane
    })
  } finally {
    await closeApp(app, src, dir)
  }
})

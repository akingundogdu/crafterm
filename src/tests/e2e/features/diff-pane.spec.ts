import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Diff pane (§2/§7): open a PR diff via the stub `gh` (pr:diff → unified diff →
// parse → render), assert the file + changed lines render, and a line selection
// sends a `path:line` reference into the terminal. Diff panes aren't seedable
// (no SavedLeaf.diffPane), so we drive it through the PR card "Diff" button.
// HR-5: throwaway state dir only.

const GH_STUB = `#!/bin/sh
case "$1 $2" in
  "auth status") exit 0 ;;
  "repo view") echo "acme/widgets"; exit 0 ;;
  "pr list")
    echo '[{"number":42,"title":"Add dark mode","headRefName":"feature/dark","baseRefName":"main","state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","reviewDecision":"APPROVED","url":"https://example.com/pr/42","statusCheckRollup":[{"status":"COMPLETED","conclusion":"SUCCESS"}],"comments":[],"updatedAt":"2026-06-22T00:00:00Z"}]'
    exit 0 ;;
  "pr diff")
    printf '%s\\n' 'diff --git a/hello.txt b/hello.txt' 'index e69de29..4b825dc 100644' '--- a/hello.txt' '+++ b/hello.txt' '@@ -1,2 +1,2 @@' ' line one' '-old second line' '+new second line'
    exit 0 ;;
  *) echo '[]'; exit 0 ;;
esac
`

function freshStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-diff-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(dir)) throw new Error('HR-5 violated: refusing real state dir')
  return dir
}
function makeRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'crafterm-e2e-diffrepo-'))
  mkdirSync(join(repo, '.git'))
  return repo
}
function makeGhStub(): { bin: string; container: string } {
  const container = mkdtempSync(join(tmpdir(), 'crafterm-e2e-ghdiff-'))
  const bin = join(container, 'gh')
  writeFileSync(bin, GH_STUB, { mode: 0o755 })
  return { bin, container }
}
function seedPrProjects(stateDir: string, repo: string): void {
  writeFileSync(
    join(stateDir, 'crafterm-state.json'),
    JSON.stringify({ schemaVersion: 4, tree: [], notifications: [], codeRoot: tmpdir(), prProjects: [repo] })
  )
}
async function launch(dir: string, env: Record<string, string>): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: dir, ...env } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}

test('diff-pane: a PR diff renders the file + changed lines; selection sends a ref', async () => {
  const repo = makeRepo()
  const { bin, container } = makeGhStub()
  const dir = freshStateDir()
  seedPrProjects(dir, repo)
  const { app, win } = await launch(dir, { CRAFTERM_GH_BIN: bin })
  try {
    await win.locator('#notif-tab-pr').click()
    await win.locator('.pr-scopetabs .pr-subtab', { hasText: /all/i }).click()
    const card = win.locator('#notif-pr-view .pr-card', { hasText: '#42' })
    await expect(card).toBeVisible({ timeout: 10_000 })
    await card.locator('.pr-act', { hasText: 'Diff' }).click()

    const pane = win.locator('.pane-box.diff-pane')
    await test.step('the diff renders the file + a changed line', async () => {
      await expect(pane).toBeVisible({ timeout: 10_000 })
      await expect(pane.locator('.diff-path')).toHaveText('hello.txt')
      await expect(pane.locator('.diff-row.add')).toHaveCount(1)
      await expect(pane.locator('.diff-row.del')).toHaveCount(1)
      await expect(pane.locator('.diff-row.add .diff-text')).toHaveText('new second line')
    })

    await test.step('selecting a line sends `hello.txt:2` to the terminal', async () => {
      await pane.locator('.diff-row.add[data-line="2"]').click()
      await expect(pane.locator('.diff-actions')).toBeVisible()
      await pane.locator('.diff-act.diff-act-term').click()
      // the ref is injected into the auto-created starter terminal and echoed by the shell
      await expect(win.locator('.pane-box .pane-term .xterm-rows')).toContainText('hello.txt:2', { timeout: 8_000 })
    })
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
    rmSync(container, { recursive: true, force: true })
  }
})

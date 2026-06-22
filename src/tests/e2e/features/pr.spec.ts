import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// PR panel (§7), driven by a STUB `gh` binary (via CRAFTERM_GH_BIN) emitting canned
// JSON — no GitHub, no network. The "All" scope avoids needing a terminal/cwd: it
// runs `pr list` per seeded prProjects path that has a .git dir. The stub is
// stateful so a merge drops the PR from the re-fetched list. HR-5: throwaway dir.

// switch on "$1 $2"; print JSON to stdout, exit 0. No `${...}` (template-safe).
const GH_STUB = `#!/bin/sh
STATE="$CRAFTERM_GH_STATE"
case "$1 $2" in
  "auth status") exit 0 ;;
  "repo view") echo "acme/widgets"; exit 0 ;;
  "pr list")
    if grep -q merged "$STATE" 2>/dev/null; then
      echo '[]'
    else
      echo '[{"number":42,"title":"Add dark mode","headRefName":"feature/dark","baseRefName":"main","state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","reviewDecision":"APPROVED","url":"https://example.com/pr/42","statusCheckRollup":[{"status":"COMPLETED","conclusion":"SUCCESS"}],"comments":[],"updatedAt":"2026-06-22T00:00:00Z"}]'
    fi
    exit 0 ;;
  "pr merge") echo merged > "$STATE"; exit 0 ;;
  *) echo '[]'; exit 0 ;;
esac
`

function freshStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-pr-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(dir)) throw new Error('HR-5 violated: refusing real state dir')
  return dir
}
function makeRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'crafterm-e2e-prrepo-'))
  mkdirSync(join(repo, '.git')) // listAll only requires a .git dir (gh is stubbed)
  return repo
}
function makeGhStub(): { bin: string; state: string; container: string } {
  const container = mkdtempSync(join(tmpdir(), 'crafterm-e2e-ghstub-'))
  const bin = join(container, 'gh')
  writeFileSync(bin, GH_STUB, { mode: 0o755 })
  return { bin, state: join(container, 'state'), container }
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

test('pr: the All-scope panel lists PRs from the stub gh', async () => {
  const repo = makeRepo()
  const { bin, state, container } = makeGhStub()
  const dir = freshStateDir()
  seedPrProjects(dir, repo)
  const { app, win } = await launch(dir, { CRAFTERM_GH_BIN: bin, CRAFTERM_GH_STATE: state })
  try {
    await win.locator('#notif-tab-pr').click() // right panel is open by default; this fetches
    await win.locator('.pr-scopetabs .pr-subtab', { hasText: /all/i }).click()

    const card = win.locator('#notif-pr-view .pr-card', { hasText: '#42' })
    await expect(card).toBeVisible({ timeout: 10_000 })
    await expect(card.locator('.pr-title')).toContainText('Add dark mode')
    await expect(card.locator('.pr-branch-ref.head')).toContainText('feature/dark')
    await expect(card.locator('.pr-tags .pr-status-tag').first()).toBeVisible()
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
    rmSync(container, { recursive: true, force: true })
  }
})

test('pr: merging a PR runs gh + drops it from the re-fetched list', async () => {
  const repo = makeRepo()
  const { bin, state, container } = makeGhStub()
  const dir = freshStateDir()
  seedPrProjects(dir, repo)
  const { app, win } = await launch(dir, { CRAFTERM_GH_BIN: bin, CRAFTERM_GH_STATE: state })
  try {
    await win.locator('#notif-tab-pr').click()
    await win.locator('.pr-scopetabs .pr-subtab', { hasText: /all/i }).click()
    const card = win.locator('#notif-pr-view .pr-card', { hasText: '#42' })
    await expect(card).toBeVisible({ timeout: 10_000 })

    await card.locator('.pr-act.merge').click()
    await win.locator('.modal-overlay .modal-actions button.button-primary').click() // confirm merge
    // stub wrote the sentinel → re-render re-runs `pr list` → [] → the card is gone
    await expect(win.locator('#notif-pr-view .pr-card', { hasText: '#42' })).toHaveCount(0, { timeout: 10_000 })
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
    rmSync(container, { recursive: true, force: true })
  }
})

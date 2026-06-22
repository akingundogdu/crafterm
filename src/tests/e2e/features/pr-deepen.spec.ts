import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Deeper PR coverage (§7.20 Deployments sub-tab + §7.16 project picker) on top of
// pr.spec. Driven by a STUB `gh` binary (CRAFTERM_GH_BIN) — no GitHub/network. The
// All-projects scope avoids needing a terminal/cwd. HR-5: throwaway state dir only.

// switch on "$1 $2"; the deployments path adds `run list` + the two `api repos/...`
// calls (statuses matched before deployments). Template-safe — bare $VAR only.
const GH_STUB = `#!/bin/sh
STATE="$CRAFTERM_GH_STATE"
case "$1 $2" in
  "auth status") exit 0 ;;
  "repo view") echo "acme/widgets"; exit 0 ;;
  "pr list")
    echo '[{"number":42,"title":"Add dark mode","headRefName":"feature/dark","baseRefName":"main","state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","reviewDecision":"APPROVED","url":"https://example.com/pr/42","statusCheckRollup":[{"status":"COMPLETED","conclusion":"SUCCESS"}],"comments":[],"updatedAt":"2026-06-22T00:00:00Z"}]'
    exit 0 ;;
  "run list")
    echo '[{"databaseId":777,"name":"CI","displayTitle":"Add dark mode","status":"completed","conclusion":"success","event":"push","headBranch":"feature/dark","headSha":"abcdef1234567","url":"https://example.com/run/777","createdAt":"2026-06-22T00:00:00Z"}]'
    exit 0 ;;
  api*)
    case "$2" in
      */statuses*) echo '[{"state":"success","description":"Deployed to prod","environment_url":"https://app.example.com","log_url":"","target_url":"","created_at":"2026-06-22T00:00:00Z"}]' ;;
      */deployments*) echo '[{"id":555,"environment":"production","ref":"feature/dark","sha":"abcdef1","description":"Deploy dark mode","created_at":"2026-06-22T00:00:00Z"}]' ;;
      *) echo '[]' ;;
    esac
    exit 0 ;;
  *) echo '[]'; exit 0 ;;
esac
`

function freshStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-prd-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(dir)) throw new Error('HR-5 violated: refusing real state dir')
  return dir
}
function makeRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'crafterm-e2e-prdrepo-'))
  mkdirSync(join(repo, '.git')) // listAll/deploysAll only require a .git dir (gh is stubbed)
  return repo
}
function makeGhStub(): { bin: string; state: string; container: string } {
  const container = mkdtempSync(join(tmpdir(), 'crafterm-e2e-prdghstub-'))
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
// A code root with repo subdirs (each a `.git` dir) so the project picker's FS scan
// (scanRepos, no gh) finds them.
function makeCodeRoot(repoNames: string[]): { root: string; paths: Record<string, string> } {
  const root = mkdtempSync(join(tmpdir(), 'crafterm-e2e-prdroot-'))
  const paths: Record<string, string> = {}
  for (const n of repoNames) {
    const p = join(root, n)
    mkdirSync(join(p, '.git'), { recursive: true })
    paths[n] = p
  }
  return { root, paths }
}
function seedEmptyPrProjects(stateDir: string, codeRoot: string): void {
  writeFileSync(
    join(stateDir, 'crafterm-state.json'),
    JSON.stringify({ schemaVersion: 4, tree: [], notifications: [], codeRoot, prProjects: [] })
  )
}
async function launch(dir: string, env: Record<string, string>): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: dir, ...env } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}

test('pr: the Deployments All-scope tab renders deployment + workflow-run cards with badges', async () => {
  const repo = makeRepo()
  const { bin, state, container } = makeGhStub()
  const dir = freshStateDir()
  seedPrProjects(dir, repo)
  const { app, win } = await launch(dir, { CRAFTERM_GH_BIN: bin, CRAFTERM_GH_STATE: state })
  try {
    await win.locator('#notif-tab-pr').click()
    await win.locator('.pr-subtab', { hasText: 'Deployments' }).click() // view strip (unique label)
    await win.locator('.pr-scopetabs .pr-subtab', { hasText: /all/i }).click()

    const deploy = win.locator('#notif-pr-view .pr-card', { hasText: 'production' })
    await expect(deploy).toBeVisible({ timeout: 10_000 })
    await expect(deploy.locator('.pr-status-tag')).toContainText('success')
    await expect(deploy.locator('.pr-act.primary')).toBeVisible() // open-URL (don't click — external)

    const run = win.locator('#notif-pr-view .pr-card', { hasText: 'CI' })
    await expect(run).toBeVisible()
    await expect(run.locator('.pr-status-tag')).toContainText('success')
    await expect(run.locator('.pr-act.primary')).toBeVisible() // open-on-GitHub (don't click)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
    rmSync(container, { recursive: true, force: true })
  }
})

test('pr: the project picker scopes the All-projects PR list to the saved repos', async () => {
  const { root } = makeCodeRoot(['alpha', 'beta'])
  const { bin, state, container } = makeGhStub()
  const dir = freshStateDir()
  seedEmptyPrProjects(dir, root) // empty → the "+ Add projects" bar shows
  const { app, win } = await launch(dir, { CRAFTERM_GH_BIN: bin, CRAFTERM_GH_STATE: state })
  try {
    await win.locator('#notif-tab-pr').click()
    await win.locator('.pr-scopetabs .pr-subtab', { hasText: /all/i }).click()

    await win.locator('#notif-pr-view .pr-allbar .settings-inline-btn', { hasText: '+ Add projects' }).click()
    const modal = win.locator('.modal.picker-modal')
    await expect(modal).toBeVisible({ timeout: 10_000 })
    await expect(modal.locator('.pr-pick-row')).toHaveCount(2) // alpha + beta scanned from the code root

    await modal.locator('.pr-pick-row', { hasText: 'alpha' }).locator('input[type=checkbox]').check()
    await modal.locator('.modal-actions button.button-primary').click() // Save

    // saved → renderPr re-runs; the All-scope PR list is now scoped to ONLY "alpha"
    await expect(win.locator('#notif-pr-view .pr-section-head')).toHaveCount(1, { timeout: 10_000 })
    await expect(win.locator('#notif-pr-view .pr-section-head')).toContainText('alpha')
    await expect(win.locator('#notif-pr-view .pr-card', { hasText: '#42' })).toBeVisible({ timeout: 10_000 })
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
    rmSync(root, { recursive: true, force: true })
    rmSync(container, { recursive: true, force: true })
  }
})

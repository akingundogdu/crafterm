import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Docker sidebar mode (§7), driven by a STUB `docker` binary (via the
// CRAFTERM_DOCKER_BIN override) emitting canned `{{json .}}` lines — deterministic,
// no daemon. The stub is stateful (a state file) so a Stop action flips the next
// `ps` to "exited". HR-5: throwaway state dir only.

// `docker version` → availability; `ps` → one container "web" (running, unless a
// prior `stop` wrote the state file → "exited"); `images` → one image; actions
// succeed. No `${...}` (template-literal safe — only bare `$VAR`).
const STUB = `#!/bin/sh
STATE="$CRAFTERM_DOCKER_STATE"
if [ -n "$CRAFTERM_DOCKER_UNAVAIL" ] && [ "$1" = "version" ]; then exit 1; fi
case "$1" in
  version) echo "27.0.3"; exit 0 ;;
  ps)
    if grep -q stopped "$STATE" 2>/dev/null; then
      echo '{"ID":"abc123","Names":"web","State":"exited","Image":"nginx:latest","Status":"Exited (0)","Ports":""}'
    else
      echo '{"ID":"abc123","Names":"web","State":"running","Image":"nginx:latest","Status":"Up 3 minutes","Ports":"0.0.0.0:8080->80/tcp"}'
    fi
    exit 0 ;;
  images) echo '{"ID":"sha256:aaa","Repository":"nginx","Tag":"latest","Size":"142MB","CreatedSince":"2 days ago"}'; exit 0 ;;
  stats) echo '{"ID":"abc123","CPUPerc":"0.05%","MemPerc":"1.2%","MemUsage":"12MiB / 2GiB"}'; exit 0 ;;
  stop) echo stopped > "$STATE"; exit 0 ;;
  start) rm -f "$STATE"; exit 0 ;;
  *) exit 0 ;;
esac
`

function freshStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-dk-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(dir)) throw new Error('HR-5 violated: refusing real state dir')
  return dir
}
function makeStub(): { bin: string; state: string; container: string } {
  const container = mkdtempSync(join(tmpdir(), 'crafterm-e2e-dkstub-'))
  const bin = join(container, 'docker')
  writeFileSync(bin, STUB, { mode: 0o755 })
  return { bin, state: join(container, 'state'), container }
}
async function launch(dir: string, env: Record<string, string>): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: dir, ...env } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}

test('docker: lists containers from the stub; switch to Images', async () => {
  const { bin, state, container } = makeStub()
  const dir = freshStateDir()
  const { app, win } = await launch(dir, { CRAFTERM_DOCKER_BIN: bin, CRAFTERM_DOCKER_STATE: state })
  try {
    await win.locator('#tab-docker').click() // default sub-tab "containers" → available() + ps run automatically
    await expect(win.locator('#tab-list .docker-row', { hasText: 'web' })).toBeVisible({ timeout: 10_000 })

    await test.step('switch to the Images sub-tab', async () => {
      await win.locator('.docker-subtab', { hasText: 'Images' }).click()
      await expect(win.locator('#tab-list .docker-row', { hasText: 'nginx' })).toBeVisible({ timeout: 10_000 })
    })
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
    rmSync(container, { recursive: true, force: true })
  }
})

test('docker: stopping a running container flips it to stopped (action → reload)', async () => {
  const { bin, state, container } = makeStub()
  const dir = freshStateDir()
  const { app, win } = await launch(dir, { CRAFTERM_DOCKER_BIN: bin, CRAFTERM_DOCKER_STATE: state })
  try {
    await win.locator('#tab-docker').click()
    const row = win.locator('#tab-list .docker-row', { hasText: 'web' })
    await expect(row).toBeVisible({ timeout: 10_000 })
    await expect(row.getByRole('button', { name: 'Stop', exact: true })).toBeVisible() // running → Stop offered

    await row.getByRole('button', { name: 'Stop', exact: true }).click() // act('stop') — no confirm (non-destructive)
    // stub wrote the state file → reload re-runs ps → "exited" → the row now offers Start
    await expect(
      win.locator('#tab-list .docker-row', { hasText: 'web' }).getByRole('button', { name: 'Start', exact: true })
    ).toBeVisible({ timeout: 10_000 })
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
    rmSync(container, { recursive: true, force: true })
  }
})

test('docker: an unavailable daemon shows the empty state + Retry', async () => {
  const { bin, state, container } = makeStub()
  const dir = freshStateDir()
  const { app, win } = await launch(dir, { CRAFTERM_DOCKER_BIN: bin, CRAFTERM_DOCKER_STATE: state, CRAFTERM_DOCKER_UNAVAIL: '1' })
  try {
    await win.locator('#tab-docker').click()
    await expect(win.locator('#tab-list .docker-empty-title')).toBeVisible({ timeout: 10_000 })
    await expect(win.locator('#tab-list .docker-empty')).toContainText('not available')
    await expect(win.locator('#tab-list button.settings-inline-btn', { hasText: 'Retry' })).toBeVisible()
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
    rmSync(container, { recursive: true, force: true })
  }
})

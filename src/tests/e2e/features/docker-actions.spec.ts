import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Remaining Docker actions (§7.11 volume/network remove + prune; §7.12 compose
// restart/down) on top of docker-deepen.spec. Driven by an extended stateful STUB
// `docker` binary (CRAFTERM_DOCKER_BIN) — no daemon. HR-5: throwaway state dir only.

// volume/network rm + compose down write markers so the next ls reflects the change;
// prunes just exit 0 (the app shows no success UI). Template-literal safe — bare $VAR.
const STUB = `#!/bin/sh
STATE="$CRAFTERM_DOCKER_STATE"
if [ -n "$CRAFTERM_DOCKER_UNAVAIL" ] && [ "$1" = "version" ]; then exit 1; fi
case "$1" in
  version) echo "27.0.3"; exit 0 ;;
  ps)
    if grep -q removed "$STATE" 2>/dev/null; then exit 0; fi
    echo '{"ID":"abc123","Names":"web","State":"running","Image":"nginx:latest","Status":"Up 3 minutes","Ports":"0.0.0.0:8080->80/tcp"}'
    exit 0 ;;
  images) echo '{"ID":"sha256:aaa","Repository":"nginx","Tag":"latest","Size":"142MB","CreatedSince":"2 days ago"}'; exit 0 ;;
  stats) echo '{"ID":"abc123","CPUPerc":"0.05%","MemPerc":"1.2%","MemUsage":"12MiB / 2GiB"}'; exit 0 ;;
  restart) exit 0 ;;
  rm) echo removed >> "$STATE"; exit 0 ;;
  volume)
    case "$2" in
      ls)
        if grep -q vol_removed "$STATE" 2>/dev/null; then exit 0; fi
        echo '{"Name":"pgdata","Driver":"local","Scope":"local"}'; exit 0 ;;
      inspect) echo '[{"Name":"pgdata","Driver":"local","Mountpoint":"/var/lib/docker/volumes/pgdata/_data","Scope":"local"}]'; exit 0 ;;
      rm) echo vol_removed >> "$STATE"; exit 0 ;;
      prune) echo 'Total reclaimed space: 0B'; exit 0 ;;
      *) exit 0 ;;
    esac ;;
  network)
    case "$2" in
      ls)
        if grep -q net_removed "$STATE" 2>/dev/null; then exit 0; fi
        echo '{"ID":"net123","Name":"myapp_net","Driver":"bridge","Scope":"local"}'; exit 0 ;;
      inspect) echo '[{"Name":"myapp_net","Driver":"bridge","Scope":"local","IPAM":{"Config":[]},"Containers":{}}]'; exit 0 ;;
      rm) echo net_removed >> "$STATE"; exit 0 ;;
      prune) echo 'Total reclaimed space: 0B'; exit 0 ;;
      *) exit 0 ;;
    esac ;;
  image)
    case "$2" in
      prune) echo 'Total reclaimed space: 0B'; exit 0 ;;
      *) exit 0 ;;
    esac ;;
  compose)
    if [ "$2" = "ls" ]; then
      if grep -q compose_down "$STATE" 2>/dev/null; then
        echo '[{"Name":"myapp","Status":"exited(2)","ConfigFiles":"/tmp/myapp/docker-compose.yml"}]'; exit 0
      fi
      echo '[{"Name":"myapp","Status":"running(2)","ConfigFiles":"/tmp/myapp/docker-compose.yml"}]'; exit 0
    fi
    case "$*" in *" down") echo compose_down >> "$STATE" ;; esac
    exit 0 ;;
  *) exit 0 ;;
esac
`

function freshStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-dka-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(dir)) throw new Error('HR-5 violated: refusing real state dir')
  return dir
}
function makeStub(): { bin: string; state: string; container: string } {
  const container = mkdtempSync(join(tmpdir(), 'crafterm-e2e-dkastub-'))
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
function stubEnv(bin: string, state: string): Record<string, string> {
  return { CRAFTERM_DOCKER_BIN: bin, CRAFTERM_DOCKER_STATE: state }
}

test('docker-actions: removing a volume (confirm) makes the row disappear', async () => {
  const { bin, state, container } = makeStub()
  const dir = freshStateDir()
  const { app, win } = await launch(dir, stubEnv(bin, state))
  try {
    await win.locator('#tab-docker').click()
    await win.locator('.docker-subtab', { hasText: 'Volumes' }).click()
    const row = win.locator('#tab-list .docker-row', { hasText: 'pgdata' })
    await expect(row).toBeVisible({ timeout: 10_000 })

    await row.getByRole('button', { name: 'Remove', exact: true }).click()
    const dialog = win.locator('.modal-overlay').filter({ hasText: 'Remove volume' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click() // scope avoids the row "Remove" collision

    await expect(win.locator('#tab-list .docker-row', { hasText: 'pgdata' })).toHaveCount(0, { timeout: 10_000 })
    await expect(win.locator('#tab-list .docker-empty-row')).toBeVisible()
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
    rmSync(container, { recursive: true, force: true })
  }
})

test('docker-actions: removing a network (confirm) makes the row disappear', async () => {
  const { bin, state, container } = makeStub()
  const dir = freshStateDir()
  const { app, win } = await launch(dir, stubEnv(bin, state))
  try {
    await win.locator('#tab-docker').click()
    await win.locator('.docker-subtab', { hasText: 'Networks' }).click()
    const row = win.locator('#tab-list .docker-row', { hasText: 'myapp_net' })
    await expect(row).toBeVisible({ timeout: 10_000 })

    await row.getByRole('button', { name: 'Remove', exact: true }).click()
    const dialog = win.locator('.modal-overlay').filter({ hasText: 'Remove network' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click()

    await expect(win.locator('#tab-list .docker-row', { hasText: 'myapp_net' })).toHaveCount(0, { timeout: 10_000 })
    await expect(win.locator('#tab-list .docker-empty-row')).toBeVisible()
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
    rmSync(container, { recursive: true, force: true })
  }
})

test('docker-actions: pruning unused images (confirm) runs without error', async () => {
  const { bin, state, container } = makeStub()
  const dir = freshStateDir()
  const { app, win } = await launch(dir, stubEnv(bin, state))
  try {
    await win.locator('#tab-docker').click()
    await win.locator('.docker-subtab', { hasText: 'Images' }).click()
    await expect(win.locator('#tab-list .docker-row', { hasText: 'nginx' })).toBeVisible({ timeout: 10_000 })

    await win.locator('#tab-list .docker-list-foot button', { hasText: 'Prune unused images' }).click()
    const dialog = win.locator('.modal-overlay').filter({ hasText: 'Prune unused images' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await dialog.getByRole('button', { name: 'Prune', exact: true }).click()

    // success path: no "Prune failed" modal; the list re-renders (nginx still listed)
    await expect(win.locator('.docker-text-modal')).toHaveCount(0)
    await expect(win.locator('#tab-list .docker-row', { hasText: 'nginx' })).toBeVisible({ timeout: 10_000 })
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
    rmSync(container, { recursive: true, force: true })
  }
})

test('docker-actions: restarting a compose project runs without error', async () => {
  const { bin, state, container } = makeStub()
  const dir = freshStateDir()
  const { app, win } = await launch(dir, stubEnv(bin, state))
  try {
    await win.locator('#tab-docker').click()
    await win.locator('.docker-subtab', { hasText: 'Compose' }).click()
    const row = win.locator('#tab-list .docker-row', { hasText: 'myapp' })
    await expect(row).toBeVisible({ timeout: 10_000 })
    await row.getByRole('button', { name: 'Restart', exact: true }).click() // no confirm

    await expect(win.locator('.docker-text-modal')).toHaveCount(0)
    await expect(
      win.locator('#tab-list .docker-row', { hasText: 'myapp' }).getByRole('button', { name: 'Stop', exact: true })
    ).toBeVisible({ timeout: 10_000 }) // still running
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
    rmSync(container, { recursive: true, force: true })
  }
})

test('docker-actions: taking a compose project down (confirm) flips it to offer Start', async () => {
  const { bin, state, container } = makeStub()
  const dir = freshStateDir()
  const { app, win } = await launch(dir, stubEnv(bin, state))
  try {
    await win.locator('#tab-docker').click()
    await win.locator('.docker-subtab', { hasText: 'Compose' }).click()
    const row = win.locator('#tab-list .docker-row', { hasText: 'myapp' })
    await expect(row).toBeVisible({ timeout: 10_000 })

    await row.getByRole('button', { name: 'Down', exact: true }).click() // destructive → confirm
    const dialog = win.locator('.modal-overlay').filter({ hasText: 'Compose down' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await dialog.getByRole('button', { name: 'Down', exact: true }).click()

    await expect(win.locator('.docker-text-modal')).toHaveCount(0)
    // stub wrote compose_down → reload `compose ls` → exited → the row now offers Start
    await expect(
      win.locator('#tab-list .docker-row', { hasText: 'myapp' }).getByRole('button', { name: 'Start', exact: true })
    ).toBeVisible({ timeout: 10_000 })
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
    rmSync(container, { recursive: true, force: true })
  }
})

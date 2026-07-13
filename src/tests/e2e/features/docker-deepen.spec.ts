import { test, expect } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { freshStateDir, launchApp, closeApp } from '../_harness.js'

// Deeper Docker coverage (§7.8–§7.12) on top of docker.spec: the volumes/networks/
// compose sub-tabs, container restart + remove actions, and the inspect detail
// modal. Driven by an extended STUB `docker` binary (CRAFTERM_DOCKER_BIN) — no
// daemon. Logs/Terminal/Exec spawn real ptys, so they are intentionally not
// exercised (only asserted present). HR-5: throwaway state dir only.

// Stateful stub: ps reflects a stopped/removed marker file; volume/network/compose
// branch on $2 (ls vs rm vs inspect); compose ls is a JSON array, the rest JSON-lines.
// Template-literal safe — only bare $VAR, no ${...}.
const STUB = `#!/bin/sh
STATE="$CRAFTERM_DOCKER_STATE"
if [ -n "$CRAFTERM_DOCKER_UNAVAIL" ] && [ "$1" = "version" ]; then exit 1; fi
case "$1" in
  version) echo "27.0.3"; exit 0 ;;
  ps)
    if grep -q removed "$STATE" 2>/dev/null; then exit 0; fi
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
  restart) exit 0 ;;
  rm) echo removed > "$STATE"; exit 0 ;;
  volume)
    case "$2" in
      ls) echo '{"Name":"pgdata","Driver":"local","Scope":"local"}'; exit 0 ;;
      inspect) echo '[{"Name":"pgdata","Driver":"local","Mountpoint":"/var/lib/docker/volumes/pgdata/_data","Scope":"local"}]'; exit 0 ;;
      *) exit 0 ;;
    esac ;;
  network)
    case "$2" in
      ls) echo '{"ID":"net123","Name":"myapp_net","Driver":"bridge","Scope":"local"}'; exit 0 ;;
      inspect) echo '[{"Name":"myapp_net","Driver":"bridge","Scope":"local","IPAM":{"Config":[{"Subnet":"172.20.0.0/16","Gateway":"172.20.0.1"}]},"Containers":{}}]'; exit 0 ;;
      *) exit 0 ;;
    esac ;;
  compose)
    if [ "$2" = "ls" ]; then echo '[{"Name":"myapp","Status":"running(2)","ConfigFiles":"/tmp/myapp/docker-compose.yml"}]'; exit 0; fi
    exit 0 ;;
  inspect)
    echo '[{"State":{"Status":"running","Running":true},"Config":{"Image":"nginx:latest","Env":["FOO=bar"]},"Path":"nginx","Args":["-g","daemon off;"],"Created":"2026-01-01T00:00:00Z","HostConfig":{"RestartPolicy":{"Name":"no"}},"Mounts":[],"NetworkSettings":{"Networks":{},"Ports":{}}}]'
    exit 0 ;;
  *) exit 0 ;;
esac
`

function makeStub(): { bin: string; state: string; container: string } {
  const container = mkdtempSync(join(tmpdir(), 'crafterm-e2e-dkdstub-'))
  const bin = join(container, 'docker')
  writeFileSync(bin, STUB, { mode: 0o755 })
  return { bin, state: join(container, 'state'), container }
}
function stubEnv(bin: string, state: string): Record<string, string> {
  return { CRAFTERM_DOCKER_BIN: bin, CRAFTERM_DOCKER_STATE: state }
}

test('docker-deepen: Volumes / Networks / Compose sub-tabs each list a seeded row', async () => {
  const { bin, state, container } = makeStub()
  const dir = freshStateDir('crafterm-e2e-dkd-')
  const { app, win } = await launchApp(dir, stubEnv(bin, state))
  try {
    await win.locator('#tab-docker').click()
    await win.locator('.docker-subtab', { hasText: 'Volumes' }).click()
    await expect(win.locator('#tab-list .docker-row', { hasText: 'pgdata' })).toBeVisible({ timeout: 10_000 })

    await win.locator('.docker-subtab', { hasText: 'Networks' }).click()
    await expect(win.locator('#tab-list .docker-row', { hasText: 'myapp_net' })).toBeVisible({ timeout: 10_000 })

    await win.locator('.docker-subtab', { hasText: 'Compose' }).click()
    await expect(win.locator('#tab-list .docker-row', { hasText: 'myapp' })).toBeVisible({ timeout: 10_000 })
  } finally {
    await closeApp(app, dir, container)
  }
})

test('docker-deepen: restarting a running container keeps it running (no error)', async () => {
  const { bin, state, container } = makeStub()
  const dir = freshStateDir('crafterm-e2e-dkd-')
  const { app, win } = await launchApp(dir, stubEnv(bin, state))
  try {
    await win.locator('#tab-docker').click()
    const row = win.locator('#tab-list .docker-row', { hasText: 'web' })
    await expect(row).toBeVisible({ timeout: 10_000 })
    await row.getByRole('button', { name: 'Restart', exact: true }).click() // non-destructive, no confirm

    await expect(win.locator('.docker-text-modal')).toHaveCount(0) // no "Action failed" modal
    await expect(
      win.locator('#tab-list .docker-row', { hasText: 'web' }).getByRole('button', { name: 'Stop', exact: true })
    ).toBeVisible({ timeout: 10_000 }) // still running
  } finally {
    await closeApp(app, dir, container)
  }
})

test('docker-deepen: removing a container (confirm) makes the row disappear', async () => {
  const { bin, state, container } = makeStub()
  const dir = freshStateDir('crafterm-e2e-dkd-')
  const { app, win } = await launchApp(dir, stubEnv(bin, state))
  try {
    await win.locator('#tab-docker').click()
    const row = win.locator('#tab-list .docker-row', { hasText: 'web' })
    await expect(row).toBeVisible({ timeout: 10_000 })

    await row.getByRole('button', { name: 'Remove', exact: true }).click() // destructive → confirm
    const dialog = win.locator('.modal-overlay').filter({ hasText: 'Remove container' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click() // scope avoids the row "Remove" collision

    // stub `rm -f` marks removed → reload ps returns nothing → the row is gone
    await expect(win.locator('#tab-list .docker-row', { hasText: 'web' })).toHaveCount(0, { timeout: 10_000 })
    await expect(win.locator('#tab-list .docker-empty-row')).toBeVisible()
  } finally {
    await closeApp(app, dir, container)
  }
})

test('docker-deepen: the inspect modal shows the structured table + Raw JSON toggle + Logs/Terminal tabs', async () => {
  const { bin, state, container } = makeStub()
  const dir = freshStateDir('crafterm-e2e-dkd-')
  const { app, win } = await launchApp(dir, stubEnv(bin, state))
  try {
    await win.locator('#tab-docker').click()
    const row = win.locator('#tab-list .docker-row', { hasText: 'web' })
    await expect(row).toBeVisible({ timeout: 10_000 })
    await row.getByRole('button', { name: 'Inspect', exact: true }).click()

    const modal = win.locator('.docker-detail-modal')
    await expect(modal).toBeVisible({ timeout: 10_000 })
    const kv = modal.locator('.docker-kv')
    await expect(kv).toBeVisible({ timeout: 10_000 })
    await expect(kv.locator('.docker-kv-val', { hasText: 'nginx:latest' })).toBeVisible() // Config.Image

    await test.step('Raw JSON toggle reveals the raw payload', async () => {
      await modal.getByRole('button', { name: 'Raw JSON', exact: true }).click()
      await expect(modal.locator('.docker-pre')).toBeVisible()
      await expect(modal.getByRole('button', { name: 'Structured', exact: true })).toBeVisible()
    })

    await test.step('a running container exposes Logs + Terminal tabs', async () => {
      await expect(modal.locator('.docker-detail-tab', { hasText: 'Logs' })).toBeVisible()
      await expect(modal.locator('.docker-detail-tab', { hasText: 'Terminal' })).toBeVisible()
    })
  } finally {
    await closeApp(app, dir, container)
  }
})

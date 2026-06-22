import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Reminder timer firing (§6) — the behavior the existing reminders.spec (add/
// delete/restore) never exercises. A past-due reminder fires on the immediate
// launch tick (no 20s wait): a notification card appears, a one-shot disables +
// stamps firedAt, and a repeat advances its time. HR-5: throwaway dir only.

function freshStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-rem-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(dir)) throw new Error('HR-5 violated: refusing real state dir')
  return dir
}
function readState(dir: string): Record<string, any> | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'crafterm-state.json'), 'utf8'))
  } catch {
    return null
  }
}
async function launch(dir: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: dir } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}

test('reminders: a past-due reminder fires on launch (card + state change)', async () => {
  const dir = freshStateDir()
  const past = Date.now() - 60_000
  writeFileSync(
    join(dir, 'crafterm-state.json'),
    JSON.stringify({
      schemaVersion: 4,
      tree: [],
      notifications: [],
      notifSound: '', // suppress the afplay IPC
      reminders: [
        { id: 'rem-os', text: 'E2E OneShot Fire', time: past, repeat: 'none', enabled: true },
        { id: 'rem-rep', text: 'E2E Repeat Fire', time: past, repeat: 'interval', intervalMin: 30, enabled: true }
      ]
    })
  )
  const { app, win } = await launch(dir)
  try {
    await test.step('the one-shot reminder pushes a notification card', async () => {
      await expect(win.locator('#notif-list .notif-card', { hasText: 'E2E OneShot Fire' })).toBeVisible({ timeout: 10_000 })
    })

    await test.step('one-shot disabled + firedAt; repeat advanced forward', async () => {
      await expect
        .poll(() => (readState(dir)?.reminders ?? []).some((r: any) => r.id === 'rem-os' && r.enabled === false && typeof r.firedAt === 'number'), { timeout: 5_000 })
        .toBe(true)
      await expect
        .poll(() => (readState(dir)?.reminders ?? []).some((r: any) => r.id === 'rem-rep' && r.enabled === true && r.time > past), { timeout: 5_000 })
        .toBe(true)
    })
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

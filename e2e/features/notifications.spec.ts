import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Notification panel through the real UI. Cards are an in-memory, capped feed
// read via notificationRepo; dismiss/clear mutate it. They're created by app
// events, so we seed a couple recent ones, then exercise dismiss + clear-all.

function freshDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'crafterm-e2e-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(d)) throw new Error('HR-5 violated: refusing real state dir')
  return d
}
async function launch(dir: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_STATE_DIR: dir } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}

const NOW = Date.now()
const N1 = `E2E Notif One ${NOW}`
const N2 = `E2E Notif Two ${NOW}`

test('notifications: dismiss a card and clear all', async () => {
  const dir = freshDir()
  writeFileSync(
    join(dir, 'crafterm-state.json'),
    JSON.stringify({
      schemaVersion: 4,
      tree: [],
      notifications: [
        { id: 'n1', paneId: 'p', title: N1, group: 'g', message: 'm', time: NOW },
        { id: 'n2', paneId: 'p', title: N2, group: 'g', message: 'm', time: NOW }
      ]
    })
  )

  let app: ElectronApplication | null = null
  try {
    const s = await launch(dir)
    app = s.app
    const win = s.win
    await win.locator('#notif-tab-notifs').click()

    await test.step('both seeded notifications render', async () => {
      await expect(win.locator('#notif-list')).toContainText(N1)
      await expect(win.locator('#notif-list')).toContainText(N2)
    })

    await test.step('dismiss one card -> it disappears, the other stays', async () => {
      await win.locator('.notif-card', { hasText: N2 }).locator('.notif-card-close').click()
      await expect(win.locator('#notif-list')).not.toContainText(N2)
      await expect(win.locator('#notif-list')).toContainText(N1)
    })

    await test.step('clear all -> the list empties', async () => {
      await win.locator('#notif-clear').click()
      await expect(win.locator('#notif-list')).not.toContainText(N1)
      await expect(win.locator('#notif-list')).toContainText('No notifications')
    })
  } finally {
    if (app) await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

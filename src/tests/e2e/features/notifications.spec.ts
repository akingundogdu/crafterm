import { test, expect, type ElectronApplication } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { freshStateDir, launchApp, closeApp } from '../_harness.js'

// Notification panel through the real UI. Cards are an in-memory, capped feed
// read via notificationRepo; dismiss/clear mutate it. They're created by app
// events, so we seed a couple recent ones, then exercise dismiss + clear-all.

const NOW = Date.now()
const N1 = `E2E Notif One ${NOW}`
const N2 = `E2E Notif Two ${NOW}`

test('notifications: dismiss a card and clear all', async () => {
  const dir = freshStateDir()
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
    const s = await launchApp(dir)
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
    await closeApp(app, dir)
  }
})

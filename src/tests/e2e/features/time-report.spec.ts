import { test, expect, type Page } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { freshStateDir, launchApp, closeApp } from '../_harness.js'

// Time tracking deepen (§6): the report modal aggregates seeded entries
// (project→feature breakdown + total), and starting a pomodoro shows a running
// countdown. Pomodoro/auto FINISH needs minutes (no test hook) → deferred.
// HR-5: throwaway state dir only.

function seedTime(dir: string): void {
  const now = Date.now()
  writeFileSync(
    join(dir, 'crafterm-state.json'),
    JSON.stringify({
      schemaVersion: 4,
      tree: [
        { kind: 'project', id: 'p1', name: 'Alpha', color: null, collapsed: false, pinned: false, path: '/repo/alpha', children: [], features: [{ id: 'ft-auth', name: 'Auth' }] },
        { kind: 'project', id: 'p2', name: 'Beta', color: null, collapsed: false, pinned: false, path: '/repo/beta', children: [] }
      ],
      timeEntries: [
        { id: 'te1', projectPath: '/repo/alpha', featureId: 'ft-auth', start: now - 3_600_000, end: now - 1_800_000, source: 'manual' }, // 30m
        { id: 'te2', projectPath: '/repo/alpha', featureId: 'ft-auth', start: now - 1_800_000, end: now - 900_000, source: 'manual' }, // 15m
        { id: 'te3', projectPath: '/repo/alpha', start: now - 900_000, end: now - 300_000, source: 'auto' }, // 10m
        { id: 'te4', projectPath: '/repo/beta', start: now - 7_200_000, end: now - 3_600_000, source: 'pomodoro' } // 60m
      ]
    })
  )
}
async function openTime(win: Page): Promise<void> {
  const open = await win.locator('#app').evaluate((el) => el.classList.contains('notif-open'))
  if (!open) await win.locator('#statusbar-notif-toggle').click()
  await win.locator('#notif-tab-time').click()
}

test('time: the report modal aggregates seeded entries (project → feature → total)', async () => {
  const dir = freshStateDir('crafterm-e2e-time-')
  seedTime(dir)
  const { app, win } = await launchApp(dir)
  try {
    await openTime(win)
    await win.locator('#time-report-btn').click()
    const modal = win.locator('.modal.time-report-modal')
    await expect(modal).toBeVisible({ timeout: 10_000 })
    await expect(modal.locator('.time-report-proj', { hasText: 'Alpha' })).toContainText('55m') // 30+15+10
    await expect(modal.locator('.time-report-feat', { hasText: 'Auth' })).toContainText('45m') // 30+15
    await expect(modal.locator('.time-report-proj', { hasText: 'Beta' })).toContainText('1h 0m')
    await expect(modal.locator('.time-report-total')).toContainText('1h 55m') // 115m
  } finally {
    await closeApp(app, dir)
  }
})

test('time: starting a pomodoro shows a running countdown', async () => {
  const dir = freshStateDir('crafterm-e2e-time-')
  seedTime(dir) // provides the projects for #time-project
  const { app, win } = await launchApp(dir)
  try {
    await openTime(win)
    await win.locator('#time-project').selectOption({ label: 'Alpha' })
    await win.locator('.time-pom-preset[data-min="25"]').click()
    await expect(win.locator('#time-toggle')).toHaveText('Stop')
    await expect(win.locator('#time-toggle')).toHaveClass(/running/)
    await expect(win.locator('#time-elapsed')).toHaveText(/^00:2[45]:\d\d$/) // counting down from 25:00
    await win.locator('#time-toggle').click() // stop early (logs a short pomodoro entry)
  } finally {
    await closeApp(app, dir)
  }
})

import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// First regression net (Phase 0): the app launches and shows its UI, against an
// isolated throwaway state dir — never the real ~/.crafterm (HR-5).
let stateDir = ''
let app: ElectronApplication | null = null

test('app launches with an isolated state dir and shows the shell (HR-5)', async () => {
  stateDir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(stateDir)) {
    throw new Error('HR-5 violated: E2E must not use the real state dir')
  }

  app = await electron.launch({
    args: ['.'],
    env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: stateDir }
  })

  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
})

test.afterAll(async () => {
  if (app) await app.close()
  if (stateDir) rmSync(stateDir, { recursive: true, force: true })
})

import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Shared e2e harness: every spec drives the real Electron build against a
// throwaway state dir. These four helpers replace the launch + state-dir +
// state-read + teardown boilerplate that was inlined in every spec.

// HR-5: tests must NEVER touch the real ~/.crafterm; hard-fail if the temp
// path ever resolves there.
export function freshStateDir(prefix = 'crafterm-e2e-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  if (/\.crafterm(-dev)?(\/|$)/.test(dir)) {
    throw new Error('HR-5 violated: refusing real state dir')
  }
  return dir
}

// Launch the app against an isolated state dir and wait for the shell. extraEnv
// covers specs that need additional redirects (e.g. CRAFTERM_CLAUDE_DIR).
export async function launchApp(
  stateDir: string,
  extraEnv?: Record<string, string>
): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({
    args: ['.'],
    env: { ...(process.env as Record<string, string>), CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: stateDir, ...extraEnv }
  })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}

// Parse the persisted state file; null if it does not exist yet / is unreadable.
export function readState(dir: string): Record<string, any> | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'crafterm-state.json'), 'utf8'))
  } catch {
    return null
  }
}

// Close the app (if launched) and remove any throwaway dirs. Tolerates a null
// app and covers both teardown shapes (try/finally and afterAll).
export async function closeApp(app: ElectronApplication | null, ...dirs: string[]): Promise<void> {
  if (app) await app.close()
  for (const d of dirs) if (d) rmSync(d, { recursive: true, force: true })
}

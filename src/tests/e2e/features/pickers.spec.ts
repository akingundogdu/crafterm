import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// Pickers (§4): the command palette (Cmd+Shift+P) and terminal switcher
// (Cmd+Shift+O) — the two most deterministic (the palette seed ships in default
// settings; the starter pane gives the switcher a row). HR-5: throwaway dir only.

function freshStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-pick-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(dir)) throw new Error('HR-5 violated: refusing real state dir')
  return dir
}
async function launch(dir: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: dir } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}
// Cmd-shortcuts can miss the first keypress before focus settles; retry until the
// modal opens (a 2nd press is a no-op while a .modal-overlay is mounted).
async function openWithShortcut(win: Page, combo: string, modalSel: string): Promise<void> {
  await expect(async () => {
    await win.keyboard.press(combo)
    await expect(win.locator(modalSel)).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 15_000 })
}

test('pickers: command palette inserts a seed command; terminal switcher lists panes', async () => {
  const dir = freshStateDir()
  const { app, win } = await launch(dir)
  try {
    await test.step('command palette: git→status seed row, Enter closes', async () => {
      await openWithShortcut(win, 'Meta+Shift+p', '.picker-modal')
      await win.locator('.palette-chips button', { hasText: 'git' }).click() // default chip is zsh-only
      await win.locator('input.search-box-input').fill('status')
      await expect(win.locator('.pick-row.palette-row .palette-name', { hasText: 'status' }).first()).toBeVisible({ timeout: 5_000 })
      await win.keyboard.press('Enter') // inserts `git status` into the active terminal (no auto-run) + closes
      await expect(win.locator('.modal-overlay')).toHaveCount(0)
    })

    await test.step('terminal switcher: the starter pane is a row, Esc closes', async () => {
      await openWithShortcut(win, 'Meta+Shift+o', '.picker-modal')
      await expect(win.locator('.pick-row.claude-row').first()).toBeVisible({ timeout: 5_000 })
      await win.keyboard.press('Escape') // the search input is focused → Esc closes
      await expect(win.locator('.modal-overlay')).toHaveCount(0)
    })
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// Browser pane (§2): the Electron <webview>. Browser panes are runtime-only (no
// seedable leaf), so we open one via the pane ⋯ menu → "Open URL in browser…".
// We assert ONLY the element + src + controls (the page content is an
// out-of-process guest frame — cross-context + network-dependent, not asserted).
// HR-5: throwaway state dir only.

function freshStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-web-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(dir)) throw new Error('HR-5 violated: refusing real state dir')
  return dir
}
async function launch(dir: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: dir } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}

test('browser pane: opening a URL mounts a <webview> with controls', async () => {
  const dir = freshStateDir()
  const URL = 'https://example.com/'
  const { app, win } = await launch(dir)
  try {
    // a starter terminal exists; open its ⋯ menu → "Open URL in browser…"
    await expect(win.locator('.pane-box')).toHaveCount(1)
    await win.locator('.pane-box.active .pane-btn').click()
    await win.locator('.context-menu').getByRole('button', { name: /Open URL in browser/ }).click()
    const modal = win.locator('.modal-overlay')
    await expect(modal).toBeVisible()
    await modal.locator('input').first().fill(URL)
    await modal.locator('.modal-actions button.button-primary').click()

    const pane = win.locator('.pane-box.browser-pane')
    await expect(pane).toBeVisible({ timeout: 10_000 })
    // the <webview> is created with the src synchronously (no page load needed)
    await expect(pane.locator('webview.pane-web')).toHaveAttribute('src', URL)
    await expect(pane.locator('.pane-btn[title="Reload"]')).toBeVisible()
    await expect(pane.locator('.pane-btn[title="Open in external browser"]')).toBeVisible()
    await expect(pane.locator('.pane-title')).toContainText('example.com')
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

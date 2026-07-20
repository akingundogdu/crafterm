import { test, expect } from '@playwright/test'
import { freshStateDir, launchApp, openTerminal, closeApp } from '../_harness.js'

// Browser pane (§2): the Electron <webview>. Browser panes are runtime-only (no
// seedable leaf), so we open one via the pane ⋯ menu → "Open URL in browser…".
// We assert ONLY the element + src + controls (the page content is an
// out-of-process guest frame — cross-context + network-dependent, not asserted).
// HR-5: throwaway state dir only.

test('browser pane: opening a URL mounts a <webview> with controls', async () => {
  const dir = freshStateDir('crafterm-e2e-web-')
  const URL = 'https://example.com/'
  const { app, win } = await launchApp(dir)
  try {
    // open a terminal, then its ⋯ menu → "Open URL in browser…"
    await openTerminal(win)
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
    await closeApp(app, dir)
  }
})

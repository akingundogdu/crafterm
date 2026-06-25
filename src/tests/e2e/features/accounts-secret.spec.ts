import { test, expect } from '@playwright/test'
import { freshStateDir, launchApp, readState, closeApp } from '../_harness.js'

// Accounts secret path (§8): a secret field persists to safeStorage (NOT to
// crafterm-state.json) and reveals on demand. Gated on safeStorage availability
// (skips on headless CI), like secrets.spec. HR-5: throwaway state dir only.

test('accounts: a secret field persists to safeStorage (not JSON) and reveals', async () => {
  const dir = freshStateDir('crafterm-e2e-acc-')
  const { app, win } = await launchApp(dir)
  const VALUE = `S3CRET-${Date.now()}`
  const LABEL = `E2E Secret ${Date.now()}`
  try {
    const available = await win.evaluate(() => (window as any).crafterm.invoke('secrets:available'))
    test.skip(!available, 'safeStorage encryption unavailable on this host (headless CI)')

    await win.locator('#tab-accounts').click()
    await win.locator('#accounts-new-secret').click() // secret-kind: pre-seeds one secret field
    const modal = win.locator('.modal-overlay')
    await expect(modal).toBeVisible()
    await modal.locator('input[type="text"]').first().fill(LABEL)
    await modal.locator('input[type="password"]').first().fill(VALUE)
    await modal.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(modal).toBeHidden()

    await expect.poll(() => (readState(dir)?.accounts ?? []).some((a: any) => a.label === LABEL), { timeout: 5_000 }).toBe(true)

    await test.step('the secret value is NOT in crafterm-state.json', async () => {
      expect(JSON.stringify(readState(dir))).not.toContain('S3CRET')
    })

    await test.step('reveal fetches the value from safeStorage', async () => {
      const card = win.locator('#tab-list .accounts-card', { hasText: LABEL })
      await card.getByRole('button', { name: 'Show', exact: true }).click()
      await expect(card.locator('.accounts-meta-val.accounts-secret')).toHaveText(VALUE)
      await expect(card.getByRole('button', { name: 'Hide', exact: true })).toBeVisible()
    })
  } finally {
    await closeApp(app, dir)
  }
})

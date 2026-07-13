import { test, expect, type ElectronApplication, type Page, type Locator } from '@playwright/test'
import { freshStateDir, launchApp, readState, closeApp } from '../_harness.js'

// SSH connections through the real UI: opened from the sidebar ⋯ action menu
// ("My SSH connections"); the form writes via sshConnectionRepo -> persistence,
// the manager list reads via sshConnectionRepo.query(). Add + relaunch restore.

async function waitForState(dir: string, pred: (st: Record<string, any>) => boolean): Promise<void> {
  await expect.poll(() => { const st = readState(dir); return !!st && pred(st) }, { timeout: 5_000 }).toBe(true)
}
// Open the sidebar ⋯ menu and click "My SSH connections" -> the SSH manager modal.
async function openSshManager(win: Page): Promise<Locator> {
  await win.locator('#sidebar-actions').click()
  await win.locator('.context-menu button', { hasText: 'My SSH connections' }).click()
  const modal = win.locator('.modal-overlay').filter({ hasText: 'New connection' })
  await expect(modal).toBeVisible()
  return modal
}

const HOST = `e2e-host-${Date.now()}.example.com`

test('ssh connections: add through the action menu and restore on relaunch', async () => {
  const dir = freshStateDir()

  let app: ElectronApplication | null = null
  try {
    const s = await launchApp(dir)
    app = s.app
    const win = s.win

    await test.step('add a connection -> listed + persisted', async () => {
      const manager = await openSshManager(win)
      await manager.getByRole('button', { name: '+ New connection' }).click()
      // the form is a second overlay stacked on top of the manager
      const form = win.locator('.modal-overlay').last()
      await form.locator('input[type="text"]').first().fill(HOST) // first field = Host (required)
      await form.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(manager).toContainText(HOST)
      await waitForState(dir, (st) => (st.sshConnections ?? []).some((c: any) => c.host === HOST))
    })
  } finally {
    if (app) await app.close()
  }

  let app2: ElectronApplication | null = null
  try {
    const s2 = await launchApp(dir)
    app2 = s2.app
    const manager = await openSshManager(s2.win)
    await expect(manager).toContainText(HOST)
  } finally {
    await closeApp(app2, dir)
  }
})

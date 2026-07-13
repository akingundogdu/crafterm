import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { freshStateDir, launchApp, readState, closeApp } from '../_harness.js'

// Database tree through the real UI: create a group, then add a connection under
// it via the row context menu. The connection writes into settings.dbTree (and
// is read back by dbConnectionRepo). Assert render + persist + relaunch restore.

async function waitForState(dir: string, pred: (st: Record<string, any>) => boolean): Promise<void> {
  await expect.poll(() => { const st = readState(dir); return !!st && pred(st) }, { timeout: 5_000 }).toBe(true)
}
function flattenConns(nodes: any[]): any[] {
  return (nodes ?? []).flatMap((n) => (n.kind === 'conn' ? [n.conn] : flattenConns(n.children)))
}

const GROUP = `E2E DB Group ${Date.now()}`
const CONN = `e2e-conn-${Date.now()}`

test('database: create group + connection via UI and restore on relaunch', async () => {
  const dir = freshStateDir()

  let app: ElectronApplication | null = null
  try {
    const s = await launchApp(dir)
    app = s.app
    const win = s.win
    await win.locator('#tab-database').click() // Database sidebar mode

    await test.step('create a db group', async () => {
      await win.locator('#db-new-project').click()
      const dlg = win.locator('.modal-overlay .modal.modal-prompt')
      await expect(dlg).toBeVisible()
      await dlg.locator('input[type="text"]').first().fill(GROUP)
      await dlg.getByRole('button', { name: 'Create' }).click()
      await expect(win.locator('#tab-list')).toContainText(GROUP)
    })

    await test.step('add a connection under the group (row context menu)', async () => {
      await win.locator('#tab-list .tab-item', { hasText: GROUP }).click({ button: 'right' })
      await win.locator('.context-menu button', { hasText: 'New connection' }).click()
      const form = win.locator('.modal.db-conn-modal')
      await expect(form).toBeVisible()
      await form.locator('input.reminder-input').first().fill(CONN) // first field = Name
      await form.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(form).toBeHidden()
      await expect(win.locator('#tab-list')).toContainText(CONN)
      await waitForState(dir, (st) => flattenConns(st.dbTree).some((c) => c.name === CONN))
    })
  } finally {
    await closeApp(app)
  }

  let app2: ElectronApplication | null = null
  try {
    const s2 = await launchApp(dir)
    app2 = s2.app
    await s2.win.locator('#tab-database').click()
    await expect(s2.win.locator('#tab-list')).toContainText(GROUP)
    // group restores collapsed; expand it to reveal the persisted child connection
    await s2.win.locator('#tab-list .tab-item', { hasText: GROUP }).locator('.treeview-chevron').click()
    await expect(s2.win.locator('#tab-list')).toContainText(CONN)
    // and the connection is in the persisted dbTree
    expect(flattenConns(readState(dir)!.dbTree).some((c) => c.name === CONN)).toBe(true)
  } finally {
    await closeApp(app2, dir)
  }
})

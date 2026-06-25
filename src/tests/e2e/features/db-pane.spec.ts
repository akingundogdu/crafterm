import { test, expect, type Page } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { freshStateDir, launchApp, closeApp } from '../_harness.js'

// SQL pane + result grid (§7), backed by a temp SQLite file. The connection is
// seeded into dbTree; the schema/rows are seeded through the app's own db:query
// IPC (NOT a better-sqlite3 import — that native module is built for Electron's
// ABI and won't load in the Node test process). HR-5: throwaway state dir only.

const CONFIG = { id: 'dbc-test', engine: 'sqlite' as const, file: '' }

function seedDbTree(stateDir: string, sqlitePath: string): void {
  const seed = {
    schemaVersion: 4,
    tree: [],
    dbTree: [
      { kind: 'conn', id: 'dbn-test', collapsed: false, conn: { id: 'dbc-test', name: 'tmpdb', engine: 'sqlite', file: sqlitePath } }
    ]
  }
  writeFileSync(join(stateDir, 'crafterm-state.json'), JSON.stringify(seed))
}
async function dbQuery(win: Page, config: object, sql: string): Promise<any> {
  const res = await win.evaluate(
    async (a: { config: object; sql: string }) => (window as any).crafterm.invoke('db:query', { config: a.config, sql: a.sql }),
    { config, sql }
  )
  if (res?.error) throw new Error(`seed db:query failed: ${res.error} :: ${sql}`)
  return res
}
async function openSqlPane(win: Page): Promise<Page> {
  await win.locator('#tab-database').click()
  const connRow = win.locator('#tab-list .tab-item', { hasText: 'tmpdb' }).first()
  await expect(connRow).toBeVisible({ timeout: 10_000 })
  await connRow.click({ button: 'right' })
  await win.locator('.context-menu').getByRole('button', { name: 'New query', exact: true }).click()
  await expect(win.locator('.pane-box.sql-pane')).toBeVisible({ timeout: 10_000 })
  return win
}
async function runSql(win: Page, sql: string): Promise<void> {
  const editor = win.locator('.pane-box.sql-pane .db-query-editor .monaco-editor')
  await editor.click()
  await win.keyboard.press('Meta+a')
  await win.keyboard.type(sql)
  await win.keyboard.press('Meta+Enter')
}
async function seedUsers(win: Page, config: object): Promise<void> {
  await dbQuery(win, config, 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
  await dbQuery(win, config, "INSERT INTO users (id, name) VALUES (1, 'Alice'), (2, 'Bob')")
}

test('db-pane: run a query → result grid (rows + timing) + sort cycle', async () => {
  const dir = freshStateDir('crafterm-e2e-db-')
  const sqlite = join(dir, 'test.sqlite')
  const config = { ...CONFIG, file: sqlite }
  seedDbTree(dir, sqlite)
  const { app, win } = await launchApp(dir)
  try {
    await seedUsers(win, config)
    await openSqlPane(win)
    await runSql(win, 'SELECT * FROM users')

    const pane = win.locator('.pane-box.sql-pane')
    await expect(pane.locator('.db-grid')).toBeVisible({ timeout: 10_000 })
    await expect(pane.locator('.db-grid tbody tr')).toHaveCount(2)
    await expect(pane.locator('.db-result-rows')).toContainText('2')
    await expect(pane.locator('.db-result-ms')).toBeVisible()

    await test.step('clicking a sortable header sorts (re-runs with ORDER BY)', async () => {
      const header = pane.locator('th.db-grid-sortable').first()
      await header.click()
      await expect(header).toHaveClass(/active/, { timeout: 10_000 })
      await expect(header.locator('.db-grid-sort-arrow')).toHaveText('↑')
      await expect(pane.locator('.db-grid tbody tr')).toHaveCount(2)
    })
  } finally {
    await closeApp(app, dir)
  }
})

test('db-pane: inserting a row via the grid modal re-fetches with the new row', async () => {
  const dir = freshStateDir('crafterm-e2e-db-')
  const sqlite = join(dir, 'test.sqlite')
  const config = { ...CONFIG, file: sqlite }
  seedDbTree(dir, sqlite)
  const { app, win } = await launchApp(dir)
  try {
    await seedUsers(win, config)
    await openSqlPane(win)
    await runSql(win, 'SELECT * FROM users')
    const pane = win.locator('.pane-box.sql-pane')
    await expect(pane.locator('.db-grid tbody tr')).toHaveCount(2, { timeout: 10_000 })

    await test.step('+ New row → fill the form → INSERT + re-fetch', async () => {
      await pane.locator('button.db-grid-action-btn').click() // "+ New row" (editable: SELECT * + PK)
      const modal = win.locator('.modal.db-row-modal')
      await expect(modal).toBeVisible()
      const inputs = modal.locator('.db-row-modal-input')
      await inputs.nth(0).fill('3') // id (PK, editable on insert)
      await inputs.nth(1).fill('Carol') // name
      await modal.locator('.modal-actions button.button-primary').click()

      await expect(pane.locator('.db-grid tbody tr')).toHaveCount(3, { timeout: 10_000 })
      await expect(pane.locator('.db-grid')).toContainText('Carol')
    })
  } finally {
    await closeApp(app, dir)
  }
})

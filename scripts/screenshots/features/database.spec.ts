import { test, expect, type Page } from '@playwright/test'
import { launchDemo, closeDemo, assertNoPrivateData } from '../lib/harness.js'
import { Recorder } from '../lib/recorder.js'

// README §"Docker, databases & PRs" (database half) — the SQL workbench: connection
// tree, a Monaco editor and a result grid. The SQLite file is created and seeded
// through the app's own db:query IPC, so the query in the GIF really executes.

async function dbQuery(win: Page, file: string, sql: string): Promise<void> {
  const res = await win.evaluate(
    async (a: { file: string; sql: string }) =>
      (window as { crafterm?: { invoke: (c: string, p: unknown) => Promise<{ error?: string }> } }).crafterm?.invoke(
        'db:query',
        { config: { id: 'dbc-acme', engine: 'sqlite', file: a.file }, sql: a.sql }
      ),
    { file, sql }
  )
  if (res?.error) throw new Error(`seed failed: ${res.error} :: ${sql}`)
}

test('database workbench', async () => {
  const { app, win, ws } = await launchDemo()
  try {
    await dbQuery(win, ws.sqliteFile, 'CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY, name TEXT, city TEXT, orders INTEGER, spend REAL)')
    await dbQuery(
      win,
      ws.sqliteFile,
      "INSERT INTO customers (name, city, orders, spend) VALUES ('Mira Patel','Berlin',14,842.5),('Jonas Weber','Hamburg',9,517.0),('Ada Silva','Lisbon',22,1394.25),('Sam Okafor','Lagos',6,288.9),('Lena Fischer','Munich',17,1102.4),('Ravi Menon','Bangalore',11,655.75)"
    )
    await dbQuery(win, ws.sqliteFile, 'CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, customer_id INTEGER, total REAL, status TEXT)')

    await win.locator('#tab-database').click()
    const conn = win.locator('#tab-list .tab-item', { hasText: 'acme (local)' }).first()
    await expect(conn).toBeVisible({ timeout: 10_000 })

    const rec = new Recorder(win, 'database')
    await rec.hold(900)

    await conn.click({ button: 'right' })
    await rec.hold(700)
    await win.locator('.context-menu').getByRole('button', { name: 'New query', exact: true }).click()
    await expect(win.locator('.pane-box.sql-pane')).toBeVisible({ timeout: 10_000 })
    await rec.hold(800)

    await win.locator('.pane-box.sql-pane .db-query-editor .monaco-editor').click()
    await win.keyboard.press('Meta+a')
    await rec.typeText('select name, city, orders, spend from customers order by spend desc', 3)
    await rec.hold(600)
    await win.keyboard.press('Meta+Enter')
    await expect(win.locator('.db-grid')).toBeVisible({ timeout: 10_000 })
    await rec.hold(2200)

    await assertNoPrivateData(win)
    rec.encode()
  } finally {
    await closeDemo(app)
  }
})

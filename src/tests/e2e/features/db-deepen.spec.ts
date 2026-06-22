import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Deeper Database coverage (§7.3/§7.5/§7.6) on top of db-pane.spec: object
// introspection (expand a connection → tables), saved queries (.sql save/open/
// delete), and result-grid row edit/delete (UPDATE/DELETE → re-fetch). Temp SQLite,
// seeded via the app's own db:query IPC (no native better-sqlite3 import). HR-5.

const CONFIG = { id: 'dbc-test', engine: 'sqlite' as const, file: '' }

function freshStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-dbd-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(dir)) throw new Error('HR-5 violated: refusing real state dir')
  return dir
}
async function launch(dir: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: dir } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}
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
async function openSqlPane(win: Page): Promise<void> {
  await win.locator('#tab-database').click()
  const connRow = win.locator('#tab-list .tab-item', { hasText: 'tmpdb' }).first()
  await expect(connRow).toBeVisible({ timeout: 10_000 })
  await connRow.click({ button: 'right' })
  await win.locator('.context-menu').getByRole('button', { name: 'New query', exact: true }).click()
  await expect(win.locator('.pane-box.sql-pane')).toBeVisible({ timeout: 10_000 })
}
async function runSql(win: Page, sql: string): Promise<void> {
  const editor = win.locator('.pane-box.sql-pane .db-query-editor .monaco-editor')
  await editor.click()
  await win.keyboard.press('Meta+a')
  await win.keyboard.type(sql)
  await win.keyboard.press('Meta+Enter')
}
// id INTEGER PRIMARY KEY → pragma table_info pk=1 → isPrimary, so row edit/delete
// actions are enabled and the PK field is locked in the modal.
async function seedUsers(win: Page, config: object): Promise<void> {
  await dbQuery(win, config, 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
  await dbQuery(win, config, "INSERT INTO users (id, name) VALUES (1, 'Alice'), (2, 'Bob')")
}
async function rowCount(win: Page, config: object): Promise<number> {
  const r = await dbQuery(win, config, 'SELECT COUNT(*) AS c FROM users')
  return Number(r.rows[0][0])
}

test('db-deepen: expanding a connection introspects its tables', async () => {
  const dir = freshStateDir()
  const sqlite = join(dir, 'test.sqlite')
  const config = { ...CONFIG, file: sqlite }
  seedDbTree(dir, sqlite)
  const { app, win } = await launch(dir)
  try {
    await seedUsers(win, config)
    await win.locator('#tab-database').click()
    const connRow = win.locator('#tab-list .tab-item', { hasText: 'tmpdb' }).first()
    await expect(connRow).toBeVisible({ timeout: 10_000 })

    // expand the connection → loads objects via db:objects → the Tables section appears
    await connRow.locator('.treeview-chevron').click()
    const tablesRow = win.locator('#tab-list .db-section-row', { hasText: 'Tables' }).first()
    await expect(tablesRow).toBeVisible({ timeout: 10_000 })

    // expand Tables → the seeded "users" table object row appears
    await tablesRow.locator('.treeview-chevron').click()
    await expect(win.locator('#tab-list .db-obj-row .tab-title', { hasText: /^users$/ })).toBeVisible({ timeout: 10_000 })
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('db-deepen: save a query → lists under Queries → delete removes it', async () => {
  const dir = freshStateDir()
  const sqlite = join(dir, 'test.sqlite')
  const config = { ...CONFIG, file: sqlite }
  seedDbTree(dir, sqlite)
  const { app, win } = await launch(dir)
  try {
    await seedUsers(win, config)
    await openSqlPane(win)
    await runSql(win, 'SELECT * FROM users')
    const pane = win.locator('.pane-box.sql-pane')

    await pane.locator('.db-save-btn').click()
    const dlg = win.locator('.modal-overlay .modal.modal-prompt')
    await expect(dlg).toBeVisible()
    await dlg.locator('input[type="text"]').first().fill('daily-report')
    await dlg.getByRole('button', { name: 'Save', exact: true }).click()

    // persisted on disk in the isolated state dir, and listed in the sidebar
    const file = join(dir, 'db-queries', 'dbc-test', 'daily-report.sql')
    await expect.poll(() => existsSync(file), { timeout: 10_000 }).toBe(true)
    await win.locator('#tab-database').click()
    // the save listener opens the Queries sub-section but not the conn itself (it
    // keys expand by conn.id while the tree keys by node.id) — expand the conn so
    // the now-open Queries section + its query row render.
    const connRow = win.locator('#tab-list .tab-item', { hasText: 'tmpdb' }).first()
    await expect(connRow).toBeVisible({ timeout: 10_000 })
    await connRow.locator('.treeview-chevron').click()
    const queryRow = win.locator('#tab-list .db-obj-row', { hasText: 'daily-report' }).first()
    await expect(queryRow).toBeVisible({ timeout: 10_000 })

    // delete via the query row's context menu → file + row gone
    await queryRow.click({ button: 'right' })
    await win.locator('.context-menu').getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(win.locator('#tab-list .db-obj-row', { hasText: 'daily-report' })).toHaveCount(0, { timeout: 10_000 })
    await expect.poll(() => existsSync(file), { timeout: 10_000 }).toBe(false)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('db-deepen: editing a row via the grid modal runs UPDATE + re-fetches', async () => {
  const dir = freshStateDir()
  const sqlite = join(dir, 'test.sqlite')
  const config = { ...CONFIG, file: sqlite }
  seedDbTree(dir, sqlite)
  const { app, win } = await launch(dir)
  try {
    await seedUsers(win, config)
    await openSqlPane(win)
    await runSql(win, 'SELECT * FROM users')
    const pane = win.locator('.pane-box.sql-pane')
    await expect(pane.locator('.db-grid tbody tr')).toHaveCount(2, { timeout: 10_000 })

    // edit the first row (Alice). edit button = .db-row-action that is NOT the delete one
    await pane.locator('.db-grid tbody tr').first().locator('.db-row-action:not(.db-row-action-delete)').click()
    const modal = win.locator('.modal.db-row-modal')
    await expect(modal).toBeVisible()
    await modal.locator('.db-row-modal-input').nth(1).fill('Alicia') // [id (locked), name]
    await modal.locator('.modal-actions button.button-primary').click()

    await expect(pane.locator('.db-grid')).toContainText('Alicia', { timeout: 10_000 })
    await expect(pane.locator('.db-grid')).not.toContainText('Alice')
    const r = await dbQuery(win, config, 'SELECT name FROM users WHERE id = 1')
    expect(r.rows[0][0]).toBe('Alicia')
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('db-deepen: deleting a row via the grid runs DELETE + drops the row', async () => {
  const dir = freshStateDir()
  const sqlite = join(dir, 'test.sqlite')
  const config = { ...CONFIG, file: sqlite }
  seedDbTree(dir, sqlite)
  const { app, win } = await launch(dir)
  try {
    await seedUsers(win, config)
    await openSqlPane(win)
    await runSql(win, 'SELECT * FROM users')
    const pane = win.locator('.pane-box.sql-pane')
    await expect(pane.locator('.db-grid tbody tr')).toHaveCount(2, { timeout: 10_000 })

    await pane.locator('.db-grid tbody tr').first().locator('.db-row-action-delete').click()
    const confirm = win.locator('.modal.modal-prompt')
    await expect(confirm).toBeVisible()
    await expect(confirm).toContainText('DELETE FROM users')
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(pane.locator('.db-grid tbody tr')).toHaveCount(1, { timeout: 10_000 })
    await expect(pane.locator('.db-grid')).not.toContainText('Alice')
    expect(await rowCount(win, config)).toBe(1)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// State persistence + load-validation, end to end, in ONE real-app session.
// For every persisted entity we seed a VALID and a MALFORMED row, launch once
// (the load path validates each row against its schema and drops the bad ones
// into the live state), trigger a full persist by adding a bookmark, then read
// the re-saved file and assert per feature: the valid row survived and the
// malformed one was dropped. Malformed rows can't be produced through the UI,
// hence the seeded fixture. HR-5: throwaway state dir only.

const SCHEMA_VERSION = 4
const NOW = Date.now()

function freshStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-ent-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(dir)) throw new Error('HR-5 violated: refusing real state dir')
  return dir
}
function readState(dir: string): Record<string, any> {
  return JSON.parse(readFileSync(join(dir, 'crafterm-state.json'), 'utf8'))
}

test('every persisted entity survives load-validation and round-trips to disk', async () => {
  const dir = freshStateDir()
  const seed = {
    schemaVersion: SCHEMA_VERSION,
    // application + ios-config live nested in a ProjectNode; db-connection in dbTree.
    tree: [
      {
        kind: 'project',
        id: 'proj-valid',
        name: 'iOS App',
        color: null,
        collapsed: false,
        pinned: false,
        path: '/repo/ios',
        children: [],
        apps: [{ id: 'app-valid', name: 'API', commands: { local: 'npm start' } }],
        iosConfig: {
          project: '', scheme: 'ProdScheme', baseBundleId: '', displayPrefix: '',
          defaultSimulator: '', copyFiles: [], worktreesDir: ''
        }
      }
    ],
    dbTree: [
      { kind: 'conn', id: 'n-valid', collapsed: false, conn: { id: 'c-valid', name: 'pg', engine: 'postgres' } }
    ],
    accounts: [
      { id: 'acc-valid', kind: 'account', label: 'GitHub', tags: [], fields: [], createdAt: NOW, updatedAt: NOW },
      { id: 'acc-bad' }
    ],
    reminders: [
      { id: 'rem-valid', text: 'Standup', time: NOW + 60_000, repeat: 'none', enabled: true },
      { id: 'rem-bad', text: 'x' }
    ],
    timeEntries: [
      { id: 'te-valid', projectPath: '/repo', start: 1000, end: 2000, source: 'manual' },
      { id: 'te-bad', projectPath: '/repo' }
    ],
    sshConnections: [
      { id: 'ssh-valid', label: 'prod', host: '10.0.0.1' },
      { id: 'ssh-bad' }
    ],
    paletteCommands: [
      { id: 'pal-valid', category: 'git', name: 'status', command: 'git status' },
      { id: 'pal-bad', name: 'x' }
    ],
    actionMenu: [
      { id: 'am-valid', title: 'My cmd', kind: 'command', command: 'echo hi', opensAs: 'tab' },
      { id: 'am-bad' }
    ],
    meetingNotes: [
      { id: 'mn-valid', title: 'Sync', date: '2026-06-15', attendees: [], notes: 'n', createdAt: NOW, updatedAt: NOW },
      { id: 'mn-bad', title: 'x' }
    ],
    dailyPlan: {
      tasks: [
        { id: 'task-valid', title: 'Do X', date: '2026-06-15', status: 'todo', priority: 'medium', tagIds: [], order: 0, createdAt: NOW, updatedAt: NOW },
        { id: 'task-bad', title: 'x' }
      ],
      tags: [
        { id: 'tag-valid', name: 'urgent', color: '#f00' },
        { id: 'tag-bad' }
      ]
    },
    notifications: [
      { id: 'notif-valid', paneId: 'p', title: 'Hi', group: 'g', message: 'm', time: NOW },
      { id: 'notif-bad', time: NOW }
    ]
  }
  writeFileSync(join(dir, 'crafterm-state.json'), JSON.stringify(seed))

  let app: ElectronApplication | null = null
  try {
    app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: dir } })
    const win: Page = await app.firstWindow()
    // The malformed rows must not crash the load: the shell still boots.
    await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })

    // Flush the whole (validated) state to disk by adding a bookmark through the UI.
    const open = await win.locator('#app').evaluate((el) => el.classList.contains('notif-open'))
    if (!open) await win.locator('#statusbar-notif-toggle').click()
    await win.locator('#notif-tab-bm').click()
    await win.getByRole('button', { name: '+ Bookmark' }).click()
    const modal = win.locator('.modal-overlay')
    await expect(modal).toBeVisible()
    await modal.locator('input[type="text"]').first().fill(`FLUSH-${NOW}`)
    await modal.getByRole('button', { name: 'Save' }).click()
    await expect(win.locator('#notif-bm-view')).toContainText(`FLUSH-${NOW}`)

    let st: Record<string, any> = {}
    await expect.poll(() => {
      st = readState(dir)
      return Array.isArray(st.bookmarks) && st.bookmarks.some((b: any) => b.title === `FLUSH-${NOW}`)
    }, { timeout: 5_000 }).toBe(true)

    const has = (arr: any[], id: string): boolean => Array.isArray(arr) && arr.some((r) => r?.id === id)
    const check = (label: string, arr: any[], goodId: string, badId: string): Promise<void> =>
      test.step(label, async () => {
        expect(has(arr, goodId), `${label}: valid row kept`).toBe(true)
        expect(has(arr, badId), `${label}: malformed row dropped`).toBe(false)
      })

    // ---- flat settings entities: valid kept, malformed dropped ----
    await check('account', st.accounts, 'acc-valid', 'acc-bad')
    await check('reminder', st.reminders, 'rem-valid', 'rem-bad')
    await check('time-entry', st.timeEntries, 'te-valid', 'te-bad')
    await check('ssh-connection', st.sshConnections, 'ssh-valid', 'ssh-bad')
    await check('palette-command', st.paletteCommands, 'pal-valid', 'pal-bad')
    await check('action-menu-item', st.actionMenu, 'am-valid', 'am-bad')
    await check('meeting-note', st.meetingNotes, 'mn-valid', 'mn-bad')
    await check('daily-task', st.dailyPlan?.tasks, 'task-valid', 'task-bad')
    await check('daily-tag', st.dailyPlan?.tags, 'tag-valid', 'tag-bad')
    await check('notification', st.notifications, 'notif-valid', 'notif-bad')

    // ---- entities nested in the tree / dbTree round-trip ----
    const findProject = (nodes: any[], id: string): any =>
      (nodes ?? []).reduce(
        (f: any, n: any) => f ?? (n.kind === 'project' && n.id === id ? n : findProject(n.children, id)),
        null
      )
    const flattenConns = (nodes: any[]): any[] =>
      (nodes ?? []).flatMap((n) => (n.kind === 'conn' ? [n.conn] : flattenConns(n.children)))

    await test.step('application (ProjectNode.apps)', async () => {
      const proj = findProject(st.tree, 'proj-valid')
      expect(proj, 'project restored').toBeTruthy()
      expect(proj.apps?.some((a: any) => a.id === 'app-valid')).toBe(true)
    })
    await test.step('ios-config (per-project singleton)', async () => {
      expect(findProject(st.tree, 'proj-valid').iosConfig?.scheme).toBe('ProdScheme')
    })
    await test.step('db-connection (dbTree)', async () => {
      expect(flattenConns(st.dbTree).some((c) => c.id === 'c-valid')).toBe(true)
    })
  } finally {
    if (app) await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

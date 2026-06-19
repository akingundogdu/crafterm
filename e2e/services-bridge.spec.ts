import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

// Drives the Phase 4 / A.3 service extractions end-to-end through the real main
// process bridge: notebook, fs, git, and app-info. Each proves the IPC → service
// path works in the packaged-style runtime, not just in unit isolation.
// HR-5: throwaway state dir, never the real ~/.crafterm.

let stateDir = ''
let work = ''
let app: ElectronApplication | null = null
let win: Page

test.beforeAll(async () => {
  stateDir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-svc-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(stateDir)) throw new Error('HR-5 violated: refusing real state dir')
  work = realpathSync(mkdtempSync(join(tmpdir(), 'crafterm-e2e-work-')))
  app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: stateDir } })
  win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
})

test.afterAll(async () => {
  if (app) await app.close()
  if (stateDir) rmSync(stateDir, { recursive: true, force: true })
  if (work) rmSync(work, { recursive: true, force: true })
})

test('notebook: full CRUD + tree through the bridge', async () => {
  await win.evaluate(() => window.crafterm.notebook.create('folder/idea'))
  await win.evaluate(() => window.crafterm.notebook.write('folder/idea.md', '# hello notebook'))
  await expect
    .poll(() => win.evaluate(() => window.crafterm.notebook.read('folder/idea.md')), { timeout: 5_000 })
    .toBe('# hello notebook')

  const tree = await win.evaluate(() => window.crafterm.notebook.tree())
  const folder = tree.find((n) => n.name === 'folder')
  expect(folder?.kind).toBe('dir')
  expect(folder?.children?.some((c) => c.name === 'idea.md')).toBe(true)

  expect(await win.evaluate(() => window.crafterm.notebook.rename('folder/idea.md', 'renamed.md'))).toBe(true)
  expect(await win.evaluate(() => window.crafterm.notebook.mkdir('archive'))).toBe(true)
  expect(await win.evaluate(() => window.crafterm.notebook.move('folder/renamed.md', 'archive'))).toBe(true)
  expect(await win.evaluate(() => window.crafterm.notebook.read('archive/renamed.md'))).toBe('# hello notebook')

  expect(await win.evaluate(() => window.crafterm.notebook.delete('archive'))).toBe(true)
  expect(await win.evaluate(() => window.crafterm.notebook.read('archive/renamed.md'))).toBe('')
})

test('fs: create/mkdir/write/read/list/rename through the bridge', async () => {
  const fileA = join(work, 'a.txt')
  const sub = join(work, 'sub')
  const fileB = join(work, 'sub', 'b.txt')

  expect(await win.evaluate((p) => window.crafterm.fs.createFile(p), fileA)).toBe(true)
  expect(await win.evaluate((p) => window.crafterm.fs.createFile(p), fileA)).toBe(false) // no clobber
  expect(await win.evaluate((p) => window.crafterm.fs.mkdir(p), sub)).toBe(true)
  // writeText only overwrites an existing regular file, so create it first.
  expect(await win.evaluate((p) => window.crafterm.fs.createFile(p), fileB)).toBe(true)
  expect(await win.evaluate((p) => window.crafterm.fs.writeText(p, 'content B'), fileB)).toBe(true)

  const read = await win.evaluate((p) => window.crafterm.fs.readText(p), fileB)
  expect(read).toEqual({ ok: true, text: 'content B' })

  const listed = await win.evaluate((p) => window.crafterm.fs.listEntries(p), work)
  expect(listed.entries.map((e) => `${e.isDir ? 'd' : 'f'}:${e.name}`).sort()).toEqual(['d:sub', 'f:a.txt'])

  const renamed = join(work, 'a-renamed.txt')
  expect(await win.evaluate((a) => window.crafterm.fs.renamePath(a.from, a.to), { from: fileA, to: renamed })).toBe(true)
  expect((await win.evaluate((p) => window.crafterm.fs.readText(p), fileA)).ok).toBe(false)
})

test('git: fileStatus + worktrees + repoGit on a real temp repo', async () => {
  const repo = join(work, 'repo')
  mkdirSync(repo, { recursive: true })
  const gitc = (...args: string[]): void => {
    execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore' })
  }
  gitc('init')
  gitc('config', 'user.email', 'e2e@test.local')
  gitc('config', 'user.name', 'E2E')
  writeFileSync(join(repo, 'tracked.txt'), 'v1\n')
  gitc('add', '.')
  gitc('commit', '-m', 'init')
  // a tracked change + an untracked file
  writeFileSync(join(repo, 'tracked.txt'), 'v2\n')
  writeFileSync(join(repo, 'untracked.txt'), 'new\n')

  const status = await win.evaluate((c) => window.crafterm.git.fileStatus(c), repo)
  const entries = Object.entries(status)
  expect(entries.some(([k, v]) => k.endsWith('/untracked.txt') && v === 'untracked')).toBe(true)
  expect(entries.some(([k, v]) => k.endsWith('/tracked.txt') && v === 'modified')).toBe(true)

  const wt = await win.evaluate((c) => window.crafterm.git.listWorktrees(c), repo)
  expect(wt.root).toBeTruthy()
  expect(wt.worktrees.length).toBeGreaterThanOrEqual(1)

  const rg = await win.evaluate((c) => window.crafterm.app.repoGit(c), repo)
  expect(rg).not.toBeNull()
  expect(rg!.commit).toMatch(/^[0-9a-f]{7,40}$/)
  expect(rg!.commitCount).toBe(1)
  expect(rg!.dirty).toBe(true)
})

test('app-info: version, build info, and build counter through the bridge', async () => {
  const version = await win.evaluate(() => window.crafterm.app.version())
  expect(typeof version).toBe('string')
  expect(version.length).toBeGreaterThan(0)

  // Dev run is unpackaged → no bundled build-info.json.
  expect(await win.evaluate(() => window.crafterm.app.buildInfo())).toBeNull()

  const count = await win.evaluate((p) => window.crafterm.app.buildCounter(p), work)
  expect(typeof count).toBe('number')
})

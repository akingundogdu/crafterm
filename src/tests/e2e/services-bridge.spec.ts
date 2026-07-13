import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { freshStateDir, launchApp, closeApp } from './_harness.js'

// Drives the service extractions end-to-end through the real main process bridge:
// notebook, fs, git, and app-info. Each proves the IPC → service path works in the
// packaged-style runtime, not just in unit isolation. Phase 10 Step 6b: the bridge
// is now the generic window.crafterm.invoke/send/on over the channel registry.
// HR-5: throwaway state dir, never the real ~/.crafterm.

declare global {
  interface Window {
    crafterm: {
      invoke(channel: string, payload?: unknown): Promise<unknown>
      send(channel: string, payload?: unknown): void
      on(channel: string, cb: (payload: unknown) => void): () => void
    }
  }
}

let stateDir = ''
let work = ''
let app: ElectronApplication | null = null
let win: Page

test.beforeAll(async () => {
  stateDir = freshStateDir('crafterm-e2e-svc-')
  work = realpathSync(mkdtempSync(join(tmpdir(), 'crafterm-e2e-work-')))
  const launched = await launchApp(stateDir)
  app = launched.app
  win = launched.win
})

test.afterAll(async () => {
  await closeApp(app, stateDir, work)
})

test('notebook: full CRUD + tree through the bridge', async () => {
  await win.evaluate(() => window.crafterm.invoke('notebook:create', { path: 'folder/idea' }))
  await win.evaluate(() => window.crafterm.send('notebook:write', { path: 'folder/idea.md', content: '# hello notebook' }))
  await expect
    .poll(() => win.evaluate(() => window.crafterm.invoke('notebook:read', { path: 'folder/idea.md' })), { timeout: 5_000 })
    .toBe('# hello notebook')

  const tree = (await win.evaluate(() => window.crafterm.invoke('notebook:tree'))) as {
    name: string
    kind: string
    children?: { name: string }[]
  }[]
  const folder = tree.find((n) => n.name === 'folder')
  expect(folder?.kind).toBe('dir')
  expect(folder?.children?.some((c) => c.name === 'idea.md')).toBe(true)

  expect(await win.evaluate(() => window.crafterm.invoke('notebook:rename', { path: 'folder/idea.md', name: 'renamed.md' }))).toBe(true)
  expect(await win.evaluate(() => window.crafterm.invoke('notebook:mkdir', { path: 'archive' }))).toBe(true)
  expect(await win.evaluate(() => window.crafterm.invoke('notebook:move', { src: 'folder/renamed.md', destDir: 'archive' }))).toBe(true)
  expect(await win.evaluate(() => window.crafterm.invoke('notebook:read', { path: 'archive/renamed.md' }))).toBe('# hello notebook')

  expect(await win.evaluate(() => window.crafterm.invoke('notebook:delete', { path: 'archive' }))).toBe(true)
  expect(await win.evaluate(() => window.crafterm.invoke('notebook:read', { path: 'archive/renamed.md' }))).toBe('')
})

test('fs: create/mkdir/write/read/list/rename through the bridge', async () => {
  const fileA = join(work, 'a.txt')
  const sub = join(work, 'sub')
  const fileB = join(work, 'sub', 'b.txt')

  expect(await win.evaluate((p) => window.crafterm.invoke('fs:createFile', { path: p }), fileA)).toBe(true)
  expect(await win.evaluate((p) => window.crafterm.invoke('fs:createFile', { path: p }), fileA)).toBe(false) // no clobber
  expect(await win.evaluate((p) => window.crafterm.invoke('fs:mkdir', { path: p }), sub)).toBe(true)
  // writeText only overwrites an existing regular file, so create it first.
  expect(await win.evaluate((p) => window.crafterm.invoke('fs:createFile', { path: p }), fileB)).toBe(true)
  expect(await win.evaluate((p) => window.crafterm.invoke('fs:writeText', { path: p, content: 'content B' }), fileB)).toBe(true)

  const read = await win.evaluate((p) => window.crafterm.invoke('fs:readText', { path: p }), fileB)
  expect(read).toEqual({ ok: true, text: 'content B' })

  const listed = (await win.evaluate((p) => window.crafterm.invoke('fs:listEntries', { path: p }), work)) as {
    entries: { name: string; isDir: boolean }[]
  }
  expect(listed.entries.map((e) => `${e.isDir ? 'd' : 'f'}:${e.name}`).sort()).toEqual(['d:sub', 'f:a.txt'])

  const renamed = join(work, 'a-renamed.txt')
  expect(await win.evaluate((a) => window.crafterm.invoke('fs:rename', { from: a.from, to: a.to }), { from: fileA, to: renamed })).toBe(true)
  expect(((await win.evaluate((p) => window.crafterm.invoke('fs:readText', { path: p }), fileA)) as { ok: boolean }).ok).toBe(false)
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

  const status = (await win.evaluate((c) => window.crafterm.invoke('git:fileStatus', { cwd: c }), repo)) as Record<string, string>
  const entries = Object.entries(status)
  expect(entries.some(([k, v]) => k.endsWith('/untracked.txt') && v === 'untracked')).toBe(true)
  expect(entries.some(([k, v]) => k.endsWith('/tracked.txt') && v === 'modified')).toBe(true)

  const wt = (await win.evaluate((c) => window.crafterm.invoke('git:worktrees', { cwd: c }), repo)) as {
    root: string | null
    worktrees: unknown[]
  }
  expect(wt.root).toBeTruthy()
  expect(wt.worktrees.length).toBeGreaterThanOrEqual(1)

  const rg = (await win.evaluate((c) => window.crafterm.invoke('app:repoGit', { repoPath: c }), repo)) as {
    commit: string
    commitCount: number
    dirty: boolean
  } | null
  expect(rg).not.toBeNull()
  expect(rg!.commit).toMatch(/^[0-9a-f]{7,40}$/)
  expect(rg!.commitCount).toBe(1)
  expect(rg!.dirty).toBe(true)
})

test('app-info: version, build info, and build counter through the bridge', async () => {
  const version = (await win.evaluate(() => window.crafterm.invoke('app:version'))) as string
  expect(typeof version).toBe('string')
  expect(version.length).toBeGreaterThan(0)

  // Dev run is unpackaged → no bundled build-info.json.
  expect(await win.evaluate(() => window.crafterm.invoke('app:buildInfo'))).toBeNull()

  const count = await win.evaluate((p) => window.crafterm.invoke('app:buildCounter', { repoPath: p }), work)
  expect(typeof count).toBe('number')
})

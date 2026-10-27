import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const emitted: { channel: string; payload: { paneStableId: string; isWaiting: boolean } }[] = []
const fakeWindow = { isDestroyed: () => false, webContents: { isDestroyed: () => false } }

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [fakeWindow] } }))
vi.mock('@services/channels.main', () => ({
  emit: (_wc: unknown, channel: string, payload: { paneStableId: string; isWaiting: boolean }) => {
    emitted.push({ channel, payload })
  },
  Channel: { Claude: { SessionsChanged: 'claude:sessionsChanged', WaitingChanged: 'claude:waitingChanged' } }
}))
vi.mock('@core/services/claude-account/claude-account.service', () => ({
  realUsage: async () => null
}))

const { ClaudeService } = await import('@services/claude/claude.service')

const waitFor = async (check: () => boolean, timeoutMs = 2000): Promise<void> => {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for a broadcast')
    await new Promise((r) => setTimeout(r, 20))
  }
}

// macOS starts an fs.watch stream asynchronously, so a write in its first few
// milliseconds can go unreported. The app starts the watcher once at launch, long
// before any hook writes; the tests give it the same head start.
const startWatching = async (service: { watchWaiting: (dir: string) => boolean }, dir: string): Promise<boolean> => {
  const started = service.watchWaiting(dir)
  await new Promise((r) => setTimeout(r, 150))
  return started
}

// The waiting hook keeps <dir>/<CRAFTERM_PANE_ID> while that pane's Claude
// session waits on the user; a new or rewritten file broadcasts
// claude:waitingChanged true, a removed one false.
describe('ClaudeService.watchWaiting', () => {
  let dir: string
  let service: InstanceType<typeof ClaudeService>

  beforeEach(() => {
    emitted.length = 0
    dir = join(mkdtempSync(join(tmpdir(), 'crafterm-waiting-')), 'claude-waiting')
    service = new ClaudeService()
  })

  afterEach(() => {
    service.dispose()
    rmSync(join(dir, '..'), { recursive: true, force: true })
  })

  it('creates the dir and broadcasts a pane starting to wait', async () => {
    expect(await startWatching(service, dir)).toBe(true)
    writeFileSync(join(dir, 'pane-1'), '1')
    await waitFor(() => emitted.length > 0)
    expect(emitted.at(-1)).toEqual({
      channel: 'claude:waitingChanged',
      payload: { paneStableId: 'pane-1', isWaiting: true }
    })
  })

  it('broadcasts the pane no longer waiting once its file is removed', async () => {
    await startWatching(service, dir)
    writeFileSync(join(dir, 'pane-1'), '1')
    await waitFor(() => emitted.some((e) => e.payload.isWaiting))
    rmSync(join(dir, 'pane-1'))
    await waitFor(() => emitted.at(-1)?.payload.isWaiting === false)
    expect(emitted.at(-1)?.payload).toEqual({ paneStableId: 'pane-1', isWaiting: false })
  })

  it('broadcasts each write of a burst once', async () => {
    await startWatching(service, dir)
    writeFileSync(join(dir, 'pane-1'), '1')
    writeFileSync(join(dir, 'pane-1'), '2')
    await waitFor(() => emitted.length > 0)
    await new Promise((r) => setTimeout(r, 200))
    expect(emitted.filter((e) => e.payload.paneStableId === 'pane-1')).toHaveLength(1)
  })

  it('ignores hidden files', async () => {
    await startWatching(service, dir)
    writeFileSync(join(dir, '.DS_Store'), '')
    writeFileSync(join(dir, 'pane-2'), '1')
    await waitFor(() => emitted.length > 0)
    await new Promise((r) => setTimeout(r, 150))
    expect(emitted.map((e) => e.payload.paneStableId)).toEqual(['pane-2'])
  })

  it('broadcasts every pane when several start waiting at once', async () => {
    await startWatching(service, dir)
    writeFileSync(join(dir, 'pane-1'), '1')
    writeFileSync(join(dir, 'pane-2'), '1')
    writeFileSync(join(dir, 'pane-3'), '1')
    await waitFor(() => emitted.length >= 3)
    expect(emitted.map((e) => e.payload.paneStableId).sort()).toEqual(['pane-1', 'pane-2', 'pane-3'])
  })

  it('broadcasts again when Claude stops again in a pane that is still marked', async () => {
    await startWatching(service, dir)
    writeFileSync(join(dir, 'pane-1'), '1')
    await waitFor(() => emitted.length === 1)
    await new Promise((r) => setTimeout(r, 100))
    writeFileSync(join(dir, 'pane-1'), '2')
    await waitFor(() => emitted.length === 2)
    expect(emitted.map((e) => e.payload)).toEqual([
      { paneStableId: 'pane-1', isWaiting: true },
      { paneStableId: 'pane-1', isWaiting: true }
    ])
  })

  it('leaves files that were already there at start alone', async () => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'stale-pane'), '1')
    await startWatching(service, dir)
    writeFileSync(join(dir, 'pane-1'), '1')
    await waitFor(() => emitted.length > 0)
    await new Promise((r) => setTimeout(r, 150))
    expect(emitted.map((e) => e.payload.paneStableId)).toEqual(['pane-1'])
  })

  it('stops broadcasting after dispose', async () => {
    service.watchWaiting(dir)
    service.dispose()
    writeFileSync(join(dir, 'pane-1'), '1')
    await new Promise((r) => setTimeout(r, 200))
    expect(emitted).toHaveLength(0)
  })
})

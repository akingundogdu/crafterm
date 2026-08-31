import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }))
vi.mock('@services/channels.main', () => ({
  emit: () => {},
  Channel: { Claude: { SessionsChanged: 'claude:sessionsChanged' } }
}))
vi.mock('@core/services/claude-account/claude-account.service', () => ({
  realUsage: async () => null
}))

const { ClaudeService } = await import('@services/claude/claude.service')

// latestSession picks the newest jsonl in a cwd's project dir. With `ofSession`
// only that session itself or a continuation of it (a jsonl whose head carries
// the old id — what `claude --resume` produces when it rolls to a NEW id)
// qualifies, so a same-cwd sibling pane's session can't be captured by mistake.
describe('ClaudeService.latestSession', () => {
  const cwd = '/w/proj'
  let root: string
  let dir: string
  const service = new ClaudeService()

  const writeSession = (id: string, content: string, mtimeSec: number): void => {
    const file = join(dir, `${id}.jsonl`)
    writeFileSync(file, content)
    utimesSync(file, mtimeSec, mtimeSec)
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'crafterm-claude-'))
    process.env.CRAFTERM_CLAUDE_DIR = root
    dir = join(root, '-w-proj') // encodeClaudeCwd('/w/proj')
    mkdirSync(dir)
  })

  afterEach(() => {
    delete process.env.CRAFTERM_CLAUDE_DIR
    rmSync(root, { recursive: true, force: true })
  })

  it('returns the newest session when no constraint is given', () => {
    writeSession('old-session', '{}', 1000)
    writeSession('new-session', '{}', 2000)
    expect(service.latestSession(cwd)).toBe('new-session')
  })

  it('skips sessions not modified after `since`', () => {
    writeSession('old-session', '{}', 1000)
    expect(service.latestSession(cwd, 1_000_000)).toBe(null)
  })

  it('prefers the continuation of `ofSession` over a newer unrelated sibling', () => {
    writeSession('old-session', '{"sessionId":"old-session"}', 1000)
    writeSession('continuation', '{"resumedFrom":"old-session"}', 2000)
    writeSession('sibling', '{"sessionId":"sibling"}', 3000)
    expect(service.latestSession(cwd, 500, 'old-session')).toBe('continuation')
  })

  it('matches `ofSession` itself when the resume kept the same id', () => {
    writeSession('old-session', '{}', 2000)
    writeSession('sibling', '{}', 3000)
    expect(service.latestSession(cwd, 500, 'old-session')).toBe('old-session')
  })

  it('returns null when nothing matches `ofSession`', () => {
    writeSession('sibling', '{}', 3000)
    expect(service.latestSession(cwd, 500, 'old-session')).toBe(null)
  })

  it('applies `since` to `ofSession` candidates too', () => {
    writeSession('continuation', '{"resumedFrom":"old-session"}', 1000)
    expect(service.latestSession(cwd, 2000 * 1000, 'old-session')).toBe(null)
  })
})

// lastModel names the model actually in use for the status bar chip: the newest
// jsonl across every project dir, scanned from its tail for the last assistant
// record carrying a real `message.model`.
describe('ClaudeService.lastModel', () => {
  let root: string
  // A fresh service per test — lastModel caches its answer for 15s.
  let service: InstanceType<typeof ClaudeService>

  const assistant = (model: string, timestamp: string, speed?: string): string =>
    JSON.stringify({
      type: 'assistant',
      timestamp,
      message: { model, usage: speed ? { speed } : {} }
    })

  const writeSession = (proj: string, id: string, lines: string[], mtimeSec: number): void => {
    const dir = join(root, proj)
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `${id}.jsonl`)
    writeFileSync(file, lines.join('\n'))
    utimesSync(file, mtimeSec, mtimeSec)
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'crafterm-claude-model-'))
    process.env.CRAFTERM_CLAUDE_DIR = root
    service = new ClaudeService()
  })

  afterEach(() => {
    delete process.env.CRAFTERM_CLAUDE_DIR
    rmSync(root, { recursive: true, force: true })
  })

  it('returns the model + speed of the newest session across project dirs', () => {
    writeSession('-w-a', 'older', [assistant('claude-sonnet-4-5', '2026-08-01T10:00:00.000Z')], 1000)
    writeSession(
      '-w-b',
      'newer',
      [assistant('claude-opus-4-5-20251101', '2026-08-02T10:00:00.000Z', 'fast')],
      2000
    )
    expect(service.lastModel()).toEqual({
      model: 'claude-opus-4-5-20251101',
      speed: 'fast',
      at: Date.parse('2026-08-02T10:00:00.000Z')
    })
  })

  it('takes the last model in the file, not the first', () => {
    writeSession(
      '-w-a',
      'session',
      [
        assistant('claude-opus-4-5', '2026-08-01T10:00:00.000Z'),
        assistant('claude-sonnet-4-5', '2026-08-01T11:00:00.000Z')
      ],
      1000
    )
    expect(service.lastModel()?.model).toBe('claude-sonnet-4-5')
  })

  it('skips `<synthetic>` records and partial lines', () => {
    writeSession(
      '-w-a',
      'session',
      [
        assistant('claude-opus-4-5', '2026-08-01T10:00:00.000Z'),
        '{"type":"assistant","message":{"model":"<synthetic>"}}',
        '{"type":"assistant","messa'
      ],
      1000
    )
    expect(service.lastModel()?.model).toBe('claude-opus-4-5')
  })

  it('falls back to the file mtime when the record has no timestamp', () => {
    writeSession('-w-a', 'session', ['{"type":"assistant","message":{"model":"claude-opus-4-5"}}'], 1500)
    expect(service.lastModel()).toEqual({ model: 'claude-opus-4-5', speed: null, at: 1500 * 1000 })
  })

  it('returns null when no session carries a model', () => {
    writeSession('-w-a', 'session', ['{"type":"user","message":{"content":"hi"}}'], 1000)
    expect(service.lastModel()).toBe(null)
  })

  it('returns null when the projects dir does not exist', () => {
    process.env.CRAFTERM_CLAUDE_DIR = join(root, 'missing')
    expect(service.lastModel()).toBe(null)
  })

  it('serves a cached answer rather than re-reading on every call', () => {
    writeSession('-w-a', 'session', [assistant('claude-opus-4-5', '2026-08-01T10:00:00.000Z')], 1000)
    expect(service.lastModel()?.model).toBe('claude-opus-4-5')
    writeSession('-w-a', 'session2', [assistant('claude-sonnet-4-5', '2026-08-02T10:00:00.000Z')], 2000)
    expect(service.lastModel()?.model).toBe('claude-opus-4-5')
  })
})

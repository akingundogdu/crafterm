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

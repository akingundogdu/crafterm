// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Pane, TabNode } from '@views/types/types'

// The SessionStart hook records a pane's CURRENT Claude session id to a map file
// (read back through paneService.info). After a /clear the live conversation rolls
// to a new session id; refreshPaneInfo must adopt it so the sidebar reads the new
// session's /rename title instead of the frozen launch-time one.

const panes = new Map<string, { title: string }>()
let tab: TabNode | null = null
const info = vi.fn<(id: string, stableId?: string) => Promise<Record<string, unknown>>>()
const sessionTitle = vi.fn<(cwd: string, sessionId: string) => Promise<string | null>>()
const latestSession = vi.fn<() => Promise<string | null>>()
const watchSessions = vi.fn<() => Promise<void>>()

vi.mock('@views/state/spine', () => ({
  get panes() {
    return panes
  },
  state: { tree: [] },
  paneActions: {},
  requestSidebar: () => {},
  requestStatuses: () => {}
}))
vi.mock('@repositories/persistence.service', () => ({ persistence: { save: () => {} } }))
vi.mock('@views/tree/tree', () => ({ findTabByPane: () => tab }))
vi.mock('@services', () => ({
  claudeService: {
    sessionTitle: (cwd: string, sid: string) => sessionTitle(cwd, sid),
    latestSession: () => latestSession(),
    watchSessions: () => watchSessions(),
    permissionMode: () => Promise.resolve(null)
  },
  terminalService: {},
  plansService: { forBranch: () => Promise.resolve([]) },
  paneService: { info: (id: string, stableId?: string) => info(id, stableId) }
}))
vi.mock('@views/terminal/activity-detection', () => ({
  looksLikeClaudeQuestion: () => false,
  syncPaneStatus: () => {}
}))
vi.mock('@views/terminal/status-bar', () => ({ updatePaneStatus: () => {} }))

const { refreshPaneInfo } = await import('@views/terminal/pane-info')

function makeTab(title: string, paneId: string): TabNode {
  return {
    kind: 'tab',
    id: 't1',
    title,
    titleLocked: false,
    root: { type: 'leaf', paneId }
  } as unknown as TabNode
}

function makePane(opts: { claudeSessionId: string; locked: boolean; title: string }): Pane {
  const pane = {
    id: 'p1',
    stableId: 'p1',
    claude: true,
    cwd: '/w/proj',
    branch: null,
    worktree: null,
    claudeSessionId: opts.claudeSessionId,
    claudeSessionLocked: opts.locked,
    claudeSpawnedAt: 1,
    lastClaudeTitle: opts.title,
    title: opts.title,
    titleLocked: false,
    plans: [],
    plansSynced: true,
    outputTail: '',
    htitle: { textContent: opts.title }
  } as unknown as Pane
  panes.set('p1', pane as unknown as { title: string })
  return pane
}

function infoWith(claudeSessionId: string | null): Record<string, unknown> {
  return { cwd: '/w/proj', branch: null, worktree: null, lastCommand: null, claudeSessionId }
}

describe('refreshPaneInfo — Claude session-id roll (/clear) adoption', () => {
  beforeEach(() => {
    panes.clear()
    info.mockReset()
    sessionTitle.mockReset()
    latestSession.mockReset()
    watchSessions.mockReset().mockResolvedValue(undefined)
    tab = makeTab('old title', 'p1')
  })

  it('adopts a newer mapped session id and re-reads the new session title', async () => {
    const pane = makePane({ claudeSessionId: 'sid-old', locked: true, title: 'old title' })
    info.mockResolvedValue(infoWith('sid-new'))
    sessionTitle.mockImplementation((_cwd, sid) =>
      Promise.resolve(sid === 'sid-new' ? 'new title' : 'old title')
    )

    await refreshPaneInfo(pane)

    expect(pane.claudeSessionId).toBe('sid-new')
    expect(pane.claudeSessionLocked).toBe(true)
    expect(pane.title).toBe('new title')
    expect(pane.lastClaudeTitle).toBe('new title')
    // The sidebar labels a terminal by its TAB title — the roll must reach it.
    expect(tab!.title).toBe('new title')
    // The stale launch-time id must never be read for the title again.
    expect(sessionTitle).toHaveBeenCalledWith('/w/proj', 'sid-new')
    expect(latestSession).not.toHaveBeenCalled()
  })

  it('leaves a matching mapped session id untouched (no spurious title reset)', async () => {
    const pane = makePane({ claudeSessionId: 'sid-old', locked: true, title: 'old title' })
    info.mockResolvedValue(infoWith('sid-old'))
    sessionTitle.mockResolvedValue('old title')

    await refreshPaneInfo(pane)

    expect(pane.claudeSessionId).toBe('sid-old')
    expect(pane.title).toBe('old title')
    expect(pane.lastClaudeTitle).toBe('old title')
  })

  it('keeps the current id when the hook recorded nothing (fallback)', async () => {
    const pane = makePane({ claudeSessionId: 'sid-old', locked: true, title: 'old title' })
    info.mockResolvedValue(infoWith(null))
    sessionTitle.mockResolvedValue('old title')

    await refreshPaneInfo(pane)

    expect(pane.claudeSessionId).toBe('sid-old')
    expect(latestSession).not.toHaveBeenCalled()
  })
})

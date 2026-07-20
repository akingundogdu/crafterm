import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Pane, TabNode } from '@views/types/types'

const panes = new Map<string, { title: string }>()
let tab: TabNode | null = null
const sessionTitle = vi.fn<(cwd: string, sessionId: string) => Promise<string | null>>()

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
  claudeService: { sessionTitle: (cwd: string, sid: string) => sessionTitle(cwd, sid) },
  terminalService: {},
  plansService: {},
  paneService: {}
}))
vi.mock('@views/terminal/activity-detection', () => ({
  looksLikeClaudeQuestion: () => false,
  syncPaneStatus: () => {}
}))
vi.mock('@views/terminal/status-bar', () => ({ updatePaneStatus: () => {} }))

const { applyClaudeSessionTitle } = await import('@views/terminal/pane-info')

function makeTab(title: string, paneId: string, titleLocked: boolean): TabNode {
  return {
    kind: 'tab',
    id: 't1',
    title,
    titleLocked,
    root: { type: 'leaf', paneId }
  } as unknown as TabNode
}

function makePane(opts: {
  title: string
  titleLocked: boolean
  lastClaudeTitle?: string | null
}): Pane {
  const pane = {
    id: 'p1',
    title: opts.title,
    titleLocked: opts.titleLocked,
    cwd: '/w/proj',
    claudeSessionId: 'sid-1',
    lastClaudeTitle: opts.lastClaudeTitle ?? null,
    htitle: { textContent: opts.title }
  } as unknown as Pane
  panes.set('p1', pane as unknown as { title: string })
  return pane
}

describe('applyClaudeSessionTitle (session /rename vs locked titles)', () => {
  beforeEach(() => {
    panes.clear()
    sessionTitle.mockReset()
  })

  it('lets a fresh /rename beat a locked ticket title, tab included', async () => {
    const pane = makePane({ title: 'MSP-MB-62', titleLocked: true })
    tab = makeTab('MSP-MB-62', 'p1', true)
    sessionTitle.mockResolvedValue('welcome page')

    await applyClaudeSessionTitle(pane)

    expect(pane.title).toBe('welcome page')
    expect(pane.titleLocked).toBe(false)
    expect(pane.lastClaudeTitle).toBe('welcome page')
    // The sidebar labels a terminal by its TAB title — the rename must reach it.
    expect(tab.title).toBe('welcome page')
    expect(tab.titleLocked).toBe(false)
  })

  it('never lets an UNCHANGED session title clobber a later manual rename', async () => {
    const pane = makePane({
      title: 'my name',
      titleLocked: true,
      lastClaudeTitle: 'welcome page'
    })
    tab = makeTab('my name', 'p1', true)
    sessionTitle.mockResolvedValue('welcome page')

    await applyClaudeSessionTitle(pane)

    expect(pane.title).toBe('my name')
    expect(pane.titleLocked).toBe(true)
    expect(tab.title).toBe('my name')
  })

  it('lets a NEWER /rename beat that manual rename again', async () => {
    const pane = makePane({
      title: 'my name',
      titleLocked: true,
      lastClaudeTitle: 'welcome page'
    })
    tab = makeTab('my name', 'p1', true)
    sessionTitle.mockResolvedValue('home page polish')

    await applyClaudeSessionTitle(pane)

    expect(pane.title).toBe('home page polish')
    expect(tab.title).toBe('home page polish')
  })

  it('leaves a locked title alone when the session was never renamed', async () => {
    const pane = makePane({ title: 'MSP-MB-62', titleLocked: true })
    tab = makeTab('MSP-MB-62', 'p1', true)
    sessionTitle.mockResolvedValue(null)

    await applyClaudeSessionTitle(pane)

    expect(pane.title).toBe('MSP-MB-62')
    expect(pane.titleLocked).toBe(true)
  })

  it('applies the session title to an unlocked pane as before', async () => {
    const pane = makePane({ title: 'Claude', titleLocked: false })
    tab = makeTab('Claude', 'p1', false)
    sessionTitle.mockResolvedValue('welcome page')

    await applyClaudeSessionTitle(pane)

    expect(pane.title).toBe('welcome page')
    expect(pane.lastClaudeTitle).toBe('welcome page')
    expect(tab.title).toBe('welcome page')
  })
})

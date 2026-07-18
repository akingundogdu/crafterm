import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Pane, TabNode } from '@views/types/types'

const panes = new Map<string, { title: string }>()
let tab: TabNode | null = null

vi.mock('@views/state/spine', () => ({
  get panes() {
    return panes
  },
  state: { tree: [] },
  requestSidebar: () => {}
}))
vi.mock('@repositories/persistence.service', () => ({ persistence: { save: () => {} } }))
vi.mock('@views/tree/tree', () => ({ findTabByPane: () => tab }))

const { applyPaneRenameToTab, mirrorPaneTitleToTab } = await import('@views/terminal/osc-title')

function makeTab(title: string, paneIds: string[], titleLocked = false): TabNode {
  const root =
    paneIds.length === 1
      ? { type: 'leaf', paneId: paneIds[0] }
      : { type: 'split', dir: 'row', sizes: paneIds.map(() => 1), children: paneIds.map((id) => ({ type: 'leaf', paneId: id })) }
  return { kind: 'tab', id: 't1', title, titleLocked, root } as unknown as TabNode
}

const pane = (id: string, title: string): Pane => ({ id, title }) as unknown as Pane

describe('applyPaneRenameToTab (todo: the pane-header rename never reached the sidebar)', () => {
  beforeEach(() => {
    panes.clear()
  })

  it('renames the terminal when its leading pane is renamed, and locks it', () => {
    panes.set('p1', { title: 'my work' })
    tab = makeTab('zsh 3', ['p1'])

    applyPaneRenameToTab(pane('p1', 'my work'))

    // The sidebar labels a terminal by its tab title — this is what "the rename did
    // nothing" meant: the row kept saying "zsh 3".
    expect(tab.title).toBe('my work')
    // Locked, so the next OSC/Claude title (and the restart that replays them) cannot
    // undo a name the user typed.
    expect(tab.titleLocked).toBe(true)
  })

  it('leaves the terminal alone when a non-leading pane of a split is renamed', () => {
    panes.set('p1', { title: 'zsh' })
    panes.set('p2', { title: 'my work' })
    tab = makeTab('zsh 3', ['p1', 'p2'])

    applyPaneRenameToTab(pane('p2', 'my work'))

    expect(tab.title).toBe('zsh 3')
    expect(tab.titleLocked).toBe(false)
  })

  it('ignores an empty name', () => {
    tab = makeTab('zsh 3', ['p1'])

    applyPaneRenameToTab(pane('p1', ''))

    expect(tab.title).toBe('zsh 3')
  })
})

describe('mirrorPaneTitleToTab', () => {
  beforeEach(() => {
    panes.clear()
  })

  it('mirrors the leading pane title onto an unlocked terminal', () => {
    panes.set('p1', { title: 'npm test' })
    tab = makeTab('zsh 3', ['p1'])

    mirrorPaneTitleToTab(pane('p1', 'npm test'))

    expect(tab.title).toBe('npm test')
  })

  it('never overwrites a name the user typed', () => {
    panes.set('p1', { title: 'npm test' })
    tab = makeTab('my work', ['p1'], true)

    mirrorPaneTitleToTab(pane('p1', 'npm test'))

    expect(tab.title).toBe('my work')
  })

  it('does not mirror an empty title (a pane starts with none)', () => {
    panes.set('p1', { title: '' })
    tab = makeTab('zsh 3', ['p1'])

    mirrorPaneTitleToTab(pane('p1', ''))

    expect(tab.title).toBe('zsh 3')
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@repositories/persistence.service', () => ({ persistence: { save: () => {} } }))
vi.mock('@views/commands/commands', () => ({ openMarkdownFile: () => {}, openCodeEditor: () => {} }))
vi.mock('@views/components/treeview/treeview', () => ({ createTreeView: () => ({ render: () => {} }) }))
vi.mock('@views/components/dialog/prompt-text', () => ({ promptText: async () => null }))
vi.mock('@views/components/dialog/confirm', () => ({ promptConfirm: async () => false }))
vi.mock('@services', () => ({ gitService: {}, fsService: {}, shellService: {} }))

const panes = new Map<string, { cwd: string }>()
const state = { activePaneId: null as string | null, tree: [] as unknown[] }
const settings = { explorerRoot: '', explorerExclude: [] as string[] }

vi.mock('@views/state/spine', () => ({
  get panes() {
    return panes
  },
  get state() {
    return state
  },
  get settings() {
    return settings
  }
}))

const { explorerRoot, searchSubPath } = await import('@views/screens/explorer/explorer.store')

describe('explorerRoot', () => {
  beforeEach(() => {
    panes.clear()
    state.activePaneId = null
    settings.explorerRoot = ''
  })

  it('follows the active terminal cwd', () => {
    panes.set('p1', { cwd: '/Users/dev/projects/alpha' })
    state.activePaneId = 'p1'
    expect(explorerRoot()).toBe('/Users/dev/projects/alpha')
  })

  it('keeps the last resolved root when no pane is active', () => {
    panes.set('p1', { cwd: '/Users/dev/projects/alpha' })
    state.activePaneId = 'p1'
    explorerRoot()
    state.activePaneId = null
    expect(explorerRoot()).toBe('/Users/dev/projects/alpha')
  })

  it('keeps the last resolved root for a pane without a cwd', () => {
    panes.set('p1', { cwd: '/Users/dev/projects/alpha' })
    state.activePaneId = 'p1'
    explorerRoot()
    panes.set('doc', { cwd: '' })
    state.activePaneId = 'doc'
    expect(explorerRoot()).toBe('/Users/dev/projects/alpha')
  })

  it('prefers the configured root over the terminal cwd', () => {
    settings.explorerRoot = '/Users/dev/workspace'
    panes.set('p1', { cwd: '/Users/dev/projects/alpha' })
    state.activePaneId = 'p1'
    expect(explorerRoot()).toBe('/Users/dev/workspace')
  })
})

describe('searchSubPath', () => {
  it('shows the last two directories when they fit', () => {
    expect(searchSubPath('/Users/dev/app/src/views/explorer.ts')).toBe('src/views')
  })

  it('falls back to the last directory when two would not fit', () => {
    expect(searchSubPath('/Users/dev/app/src/some-really-long-directory-name/explorer.ts')).toBe(
      'some-really-long-directory-name'
    )
  })

  it('handles a file at the filesystem root', () => {
    expect(searchSubPath('/notes.md')).toBe('/')
  })
})

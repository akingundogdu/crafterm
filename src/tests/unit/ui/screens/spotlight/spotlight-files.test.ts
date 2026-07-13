import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ProjectNode } from '@views/types/types'

const findFiles = vi.fn()

const projects: ProjectNode[] = []
const panes = new Map<string, { cwd: string | null }>()
const state = { activePaneId: null as string | null, tree: [] as unknown[] }
const settings = { commands: { mdFolders: [] as string[] }, explorerExclude: [] as string[] }

vi.mock('@views/state/spine', () => ({
  get panes() {
    return panes
  },
  get state() {
    return state
  },
  get settings() {
    return settings
  },
  hooks: { runShortcut: () => {} }
}))
vi.mock('@views/catalog/catalog', () => ({
  flattenProjects: () => projects,
  findProjectById: (_tree: unknown, id: string) => projects.find((p) => p.id === id) ?? null
}))
vi.mock('@services', () => ({
  fsService: { findFiles: (root: string, exclude: string[]) => findFiles(root, exclude) },
  terminalService: {},
  plansService: {},
  backlogService: {}
}))
vi.mock('@repositories', () => ({
  dailyTaskRepo: { getAll: () => [] },
  reminderRepo: { getAll: () => [] },
  paletteCommandRepo: { getAll: () => [] }
}))
vi.mock('@views/screens/pickers/project/project', () => ({ showRunApp: () => {} }))
vi.mock('@views/screens/pickers/command/command', () => ({ loadZshCommands: async () => [] }))
vi.mock('@views/screens/pickers/global-search/global-search', () => ({ SOURCE_LABEL: {} }))
vi.mock('@views/commands/commands', () => ({
  openMarkdownFile: () => {},
  selectPane: () => {},
  openCodeEditor: () => {},
  openProject: () => {},
  splitProjectRight: () => {},
  newTab: () => {},
  newClaudeTab: () => {}
}))
vi.mock('@views/tree/tree', () => ({ allTabs: () => [], panesInLayout: () => [], ancestorFolders: () => [] }))
vi.mock('@views/screens/daily-plan/daily-plan.entry', () => ({ showDailyPlanModal: () => {} }))
vi.mock('@views/screens/reminders/components/reminder-form.open', () => ({ openReminderForm: () => {} }))
vi.mock('@views/pane/pane', () => ({ paneStatus: () => 'idle' }))

const { activeProjectId, loadFiles, spotlightStore: store } = await import(
  '@views/screens/spotlight/spotlight.store'
)

function project(id: string, name: string, path: string): ProjectNode {
  return { kind: 'project', id, name, path, children: [] } as unknown as ProjectNode
}

describe('spotlight Files scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projects.length = 0
    panes.clear()
    state.activePaneId = null
    settings.commands.mdFolders = []
    findFiles.mockResolvedValue({ files: [] })
  })

  it('resolves the project the active terminal is in', () => {
    projects.push(project('p1', 'alpha', '/repos/alpha'), project('p2', 'beta', '/repos/beta'))
    panes.set('t1', { cwd: '/repos/beta/src/views' })
    state.activePaneId = 't1'

    expect(activeProjectId()).toBe('p2')
  })

  it('prefers the deepest project when one nests inside another', () => {
    projects.push(project('p1', 'mono', '/repos/mono'), project('p2', 'api', '/repos/mono/packages/api'))
    panes.set('t1', { cwd: '/repos/mono/packages/api/src' })
    state.activePaneId = 't1'

    expect(activeProjectId()).toBe('p2')
  })

  it('has no project when no terminal is active, or its cwd is outside every project', () => {
    projects.push(project('p1', 'alpha', '/repos/alpha'))
    expect(activeProjectId()).toBeNull()

    panes.set('t1', { cwd: '/somewhere/else' })
    state.activePaneId = 't1'
    expect(activeProjectId()).toBeNull()
  })

  it('scans only the selected project when the Files tab is scoped to one', async () => {
    projects.push(project('p1', 'alpha', '/repos/alpha'))
    settings.commands.mdFolders = ['/notes', '/docs']

    await loadFiles('p1')

    expect(findFiles).toHaveBeenCalledTimes(1)
    expect(findFiles).toHaveBeenCalledWith('/repos/alpha', settings.explorerExclude)
  })

  it('falls back to every configured folder when the scope is all folders', async () => {
    settings.commands.mdFolders = ['/notes', '/docs']

    await loadFiles(null)

    expect(findFiles.mock.calls.map((c) => c[0])).toEqual(['/notes', '/docs'])
  })

  it('opening the spotlight scopes Files to the active terminal’s project', () => {
    projects.push(project('p1', 'alpha', '/repos/alpha'))
    panes.set('t1', { cwd: '/repos/alpha/src' })
    state.activePaneId = 't1'

    store.reset('files')

    expect(store.fileProjectId).toBe('p1')
  })
})

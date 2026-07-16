// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { DailyPlanTask, ProjectNode } from '@views/types/types'

const upsert = vi.fn()
const openTaskInTerminal = vi.fn()
const promptConfirm = vi.fn()
const branchesAt = vi.fn()
const newTab = vi.fn()
const showSpotlight = vi.fn()

const projects: ProjectNode[] = []

vi.mock('@views/state/spine', () => ({ state: { tree: [] } }))
vi.mock('@views/lib/uid', () => ({ uid: (prefix: string) => `${prefix}-1` }))
vi.mock('@repositories', () => ({ dailyTaskRepo: { upsert: (t: DailyPlanTask) => upsert(t) } }))
vi.mock('@views/catalog/catalog', () => ({
  projectTree: () => projects.map((p) => ({ p, depth: 0 })),
  findProjectById: (_tree: unknown, id: string) => projects.find((p) => p.id === id) ?? null
}))
vi.mock('@views/screens/daily-plan/daily-plan.store', () => ({
  todayKey: () => '2026-07-13',
  nextOrder: () => 0
}))
vi.mock('@views/screens/daily-plan/daily-plan.entry', () => ({
  openTaskInTerminal: (...args: unknown[]) => openTaskInTerminal(...args)
}))
vi.mock('@views/components/dialog/confirm', () => ({
  promptConfirm: (...args: unknown[]) => promptConfirm(...args)
}))
vi.mock('@services', () => ({ gitService: { branchesAt: (cwd: string) => branchesAt(cwd) } }))
vi.mock('@views/commands/commands', () => ({ newTab: () => newTab() }))
vi.mock('@views/screens/spotlight/spotlight', () => ({ showSpotlight: (tab: string) => showSpotlight(tab) }))

const {
  default: store,
  setDraft,
  getDraft,
  seedDraftInto,
  slashQueryAt,
  slashItemsFor,
  textWithoutSlash,
  openNewTerminal,
  openSpotlight
} = await import('@views/screens/content/components/agent-composer.store')

function project(id: string, name: string, prefix?: string): ProjectNode {
  return {
    kind: 'project',
    id,
    name,
    path: `/repos/${name}`,
    issueKeyPrefix: prefix,
    children: []
  } as unknown as ProjectNode
}

describe('AgentComposerStore', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    projects.length = 0
    promptConfirm.mockResolvedValue(true)
    branchesAt.mockResolvedValue([])
    setDraft('')
    store.projectId = null
    store.branches = []
    store.mode = 'local'
    store.isPlanMode = false
  })

  it('selects the first project and prefers main as the base branch', async () => {
    projects.push(project('p1', 'alpha', 'ALP'), project('p2', 'beta', 'BET'))
    branchesAt.mockResolvedValue(['feature-x', 'main', 'develop'])

    await store.refresh()

    expect(store.projectId).toBe('p1')
    expect(branchesAt).toHaveBeenCalledWith('/repos/alpha')
    expect(store.baseBranch).toBe('main')
  })

  it('falls back to the newest branch when there is no main', async () => {
    projects.push(project('p1', 'alpha', 'ALP'))
    branchesAt.mockResolvedValue(['develop', 'legacy'])

    await store.refresh()

    expect(store.baseBranch).toBe('develop')
  })

  it('reloads the branches when the project changes', async () => {
    projects.push(project('p1', 'alpha', 'ALP'), project('p2', 'beta', 'BET'))
    branchesAt.mockResolvedValue(['main'])
    await store.refresh()

    await store.setProject('p2')

    expect(store.projectId).toBe('p2')
    expect(branchesAt).toHaveBeenLastCalledWith('/repos/beta')
  })

  it('files a ticket and runs it in a worktree off the selected base', async () => {
    projects.push(project('p1', 'alpha', 'ALP'))
    branchesAt.mockResolvedValue(['main', 'develop'])
    await store.refresh()
    store.setBaseBranch('develop')
    store.setMode('worktree')
    store.setPlanMode(true)

    await store.submit('  add a settings screen  ')

    const task = upsert.mock.calls[0][0] as DailyPlanTask
    expect(task).toMatchObject({
      title: 'add a settings scree',
      description: 'add a settings screen',
      projectId: 'p1',
      status: 'todo'
    })
    expect(openTaskInTerminal).toHaveBeenCalledWith(task, expect.any(Function), true, {
      base: 'develop',
      isPlanMode: true
    })
  })

  it('runs a local ticket in the project itself', async () => {
    projects.push(project('p1', 'alpha', 'ALP'))
    await store.refresh()

    await store.submit('fix the header')

    expect(openTaskInTerminal).toHaveBeenCalledWith(expect.anything(), expect.any(Function), false, {
      base: store.baseBranch,
      isPlanMode: false
    })
  })

  it('clears the draft once the ticket is filed', async () => {
    projects.push(project('p1', 'alpha', 'ALP'))
    await store.refresh()
    setDraft('fix the header')

    await store.submit('fix the header')

    expect(getDraft()).toBe('')
  })

  it('shortens a long prompt to a 20-char title and keeps the full text as the description', async () => {
    projects.push(project('p1', 'alpha', 'ALP'))
    await store.refresh()
    const long = 'fix the header button color and hover state'

    await store.submit(long)

    const task = upsert.mock.calls[0][0] as DailyPlanTask
    expect(task.title).toBe(long.slice(0, 20))
    expect(task.title.length).toBe(20)
    expect(task.description).toBe(long)
  })

  it('keeps a short prompt as the whole title with no description', async () => {
    projects.push(project('p1', 'alpha', 'ALP'))
    await store.refresh()

    await store.submit('short one')

    const task = upsert.mock.calls[0][0] as DailyPlanTask
    expect(task.title).toBe('short one')
    expect(task.description).toBeUndefined()
  })

  it('re-seeds the textarea from the draft on show, so it clears after a submit', () => {
    const input = document.createElement('textarea')
    document.body.appendChild(input)

    setDraft('hello world', 5)
    seedDraftInto(input)
    expect(input.value).toBe('hello world')
    expect(input.selectionStart).toBe(5)

    setDraft('')
    seedDraftInto(input)
    expect(input.value).toBe('')

    input.remove()
  })

  it('ignores an empty prompt', async () => {
    projects.push(project('p1', 'alpha', 'ALP'))
    await store.refresh()

    await store.submit('   ')

    expect(upsert).not.toHaveBeenCalled()
    expect(openTaskInTerminal).not.toHaveBeenCalled()
  })

  it('refuses to file a ticket for a project with no issue key prefix', async () => {
    projects.push(project('p1', 'alpha'))
    await store.refresh()

    await store.submit('fix the header')

    expect(upsert).not.toHaveBeenCalled()
    expect(promptConfirm).toHaveBeenCalledTimes(1)
  })

  it('warns when there is no project at all', async () => {
    await store.refresh()

    await store.submit('fix the header')

    expect(upsert).not.toHaveBeenCalled()
    expect(promptConfirm).toHaveBeenCalledTimes(1)
  })
})

describe('the escape hatches under the composer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('starts a new terminal', () => {
    openNewTerminal()
    expect(newTab).toHaveBeenCalledTimes(1)
  })

  it('opens the spotlight on its Projects tab', () => {
    openSpotlight()
    expect(showSpotlight).toHaveBeenCalledWith('projects')
  })
})

describe('the "/" menu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projects.length = 0
    store.closeSlash()
    store.projectId = null
    store.mode = 'local'
    store.isPlanMode = false
    setDraft('')
  })

  it('reads the token being typed at the caret', () => {
    expect(slashQueryAt('/bac', 4)).toEqual({ query: 'bac', start: 0 })
    expect(slashQueryAt('fix the header /pl', 18)).toEqual({ query: 'pl', start: 15 })
    expect(slashQueryAt('/plan and more', 5)).toEqual({ query: 'plan', start: 0 })
  })

  it('is not a token mid-word, after a space, or once the caret left it', () => {
    expect(slashQueryAt('http://x', 8)).toBeNull()
    expect(slashQueryAt('/plan done', 10)).toBeNull()
    expect(slashQueryAt('nothing here', 12)).toBeNull()
  })

  it('lists commands and projects, exact match first', () => {
    projects.push(project('p1', 'backend', 'BE'), project('p2', 'backoffice', 'BO'))

    expect(slashItemsFor('back').map((i) => i.label)).toEqual(['backend', 'backoffice'])
    expect(slashItemsFor('backend')[0]).toMatchObject({ kind: 'project', projectId: 'p1' })
    expect(slashItemsFor('pl').map((i) => i.label)).toEqual(['plan'])
  })

  it('ranks a prefix hit above a mid-word one', () => {
    projects.push(project('p1', 'my-backend'), project('p2', 'backend-api'))

    expect(slashItemsFor('backend').map((i) => i.label)).toEqual(['backend-api', 'my-backend'])
  })

  it('opens and closes as the caret moves in and out of a token', () => {
    projects.push(project('p1', 'backend', 'BE'))

    store.syncSlash('/back', 5)
    expect(store.isSlashOpen).toBe(true)
    expect(store.activeSlashItem?.label).toBe('backend')

    store.syncSlash('/back done', 10)
    expect(store.isSlashOpen).toBe(false)
  })

  it('wraps around while moving through the entries', () => {
    store.syncSlash('/', 1)
    const count = store.slashItems.length
    expect(count).toBeGreaterThan(1)

    store.moveSlash(-1)
    expect(store.slashIndex).toBe(count - 1)
    store.moveSlash(1)
    expect(store.slashIndex).toBe(0)
  })

  it('picking a project selects it and cuts the token out of the prompt', () => {
    projects.push(project('p1', 'backend', 'BE'))
    branchesAt.mockResolvedValue(['main'])
    const text = 'fix the header /backend'
    store.syncSlash(text, text.length)

    const item = store.activeSlashItem!
    const next = store.applySlash(item, text, text.length)

    expect(store.projectId).toBe('p1')
    // The space that preceded the token stays — the caret lands right after it.
    expect(next).toEqual({ text: 'fix the header ', caret: 15 })
    expect(getDraft()).toBe('fix the header ')
    expect(store.isSlashOpen).toBe(false)
  })

  it('picking /plan, /build, /local and /worktree switches the modes', () => {
    store.applySlash(slashItemsFor('plan')[0], '/plan', 5)
    expect(store.isPlanMode).toBe(true)
    store.applySlash(slashItemsFor('build')[0], '/build', 6)
    expect(store.isPlanMode).toBe(false)
    store.applySlash(slashItemsFor('worktree')[0], '/worktree', 9)
    expect(store.mode).toBe('worktree')
    store.applySlash(slashItemsFor('local')[0], '/local', 6)
    expect(store.mode).toBe('local')
  })

  it('cuts the token out of the middle of a prompt', () => {
    expect(textWithoutSlash('fix /plan the header', 4, 9)).toEqual({ text: 'fix  the header', caret: 4 })
  })
})

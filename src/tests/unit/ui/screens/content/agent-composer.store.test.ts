// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { DailyPlanTag, DailyPlanTask, ProjectNode } from '@views/types/types'

const upsert = vi.fn()
const openTaskInTerminal = vi.fn()
const promptConfirm = vi.fn()
const branchesAt = vi.fn()
const newTab = vi.fn()
const showSpotlight = vi.fn()

const projects: ProjectNode[] = []
const tags: DailyPlanTag[] = []

vi.mock('@views/state/spine', () => ({ state: { tree: [] } }))
vi.mock('@views/lib/uid', () => ({ uid: (prefix: string) => `${prefix}-1` }))
vi.mock('@repositories', () => ({
  dailyTaskRepo: { upsert: (t: DailyPlanTask) => upsert(t) },
  dailyTagRepo: { getAll: () => tags }
}))
vi.mock('@views/catalog/catalog', () => ({
  projectTree: () => projects.map((p) => ({ p, depth: 0 })),
  findProjectById: (_tree: unknown, id: string) => projects.find((p) => p.id === id) ?? null
}))
vi.mock('@views/screens/daily-plan/daily-plan.store', () => ({
  todayKey: () => '2026-07-13',
  nextOrder: () => 0,
  sanitizeSlug: (raw: string) =>
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
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
  openSpotlight,
  getTitleDraft,
  getBranchDraft,
  syncTitleFromPrompt,
  setTitleDraft,
  setBranchDraft,
  resetTicketMeta,
  seedMetaInto,
  liveSlug
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

function tag(id: string, name: string): DailyPlanTag {
  return { id, name, color: '#4a9eff' }
}

describe('AgentComposerStore', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    projects.length = 0
    tags.length = 0
    store.clearLabels()
    promptConfirm.mockResolvedValue(true)
    branchesAt.mockResolvedValue([])
    setDraft('')
    resetTicketMeta()
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

  it('ends with an empty draft even when the Cmd+Enter keyup writes the stale text back mid-launch', async () => {
    projects.push(project('p1', 'alpha', 'ALP'))
    await store.refresh()
    setDraft('fix the header')
    let launch!: () => void
    openTaskInTerminal.mockReturnValueOnce(new Promise<void>((resolve) => (launch = resolve)))

    const pending = store.submit('fix the header')
    // The Cmd+Enter keyup fires on the textarea while the launch is in flight; its
    // selection handler writes the textarea's still-stale value back into the draft.
    setDraft('fix the header')
    launch()
    await pending

    expect(getDraft()).toBe('')
  })

  it('reports whether the ticket was filed', async () => {
    projects.push(project('p1', 'alpha', 'ALP'))
    await store.refresh()

    await expect(store.submit('fix the header')).resolves.toBe(true)
    await expect(store.submit('   ')).resolves.toBe(false)
  })

  it('keeps the draft when the terminal launch fails, so the prompt survives for a retry', async () => {
    projects.push(project('p1', 'alpha', 'ALP'))
    await store.refresh()
    setDraft('fix the header')
    openTaskInTerminal.mockRejectedValueOnce(new Error('spawn failed'))

    await expect(store.submit('fix the header')).rejects.toThrow('spawn failed')

    expect(getDraft()).toBe('fix the header')
    expect(store.isBusy).toBe(false)
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

describe('the title and branch drafts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projects.length = 0
    tags.length = 0
    store.clearLabels()
    promptConfirm.mockResolvedValue(true)
    branchesAt.mockResolvedValue([])
    setDraft('')
    resetTicketMeta()
    store.projectId = null
    store.mode = 'local'
    store.isPlanMode = false
  })

  it('mirrors the prompt head into the title and its slug into the branch', () => {
    syncTitleFromPrompt('Fix the header button color')

    expect(getTitleDraft()).toBe('Fix the header butto')
    expect(getTitleDraft().length).toBe(20)
    expect(getBranchDraft()).toBe('fix-the-header-butto')
  })

  it('a hand-edited title breaks the prompt bond and re-derives the branch', () => {
    syncTitleFromPrompt('fix the header')
    setTitleDraft('Login fix')
    expect(getBranchDraft()).toBe('login-fix')

    syncTitleFromPrompt('something else entirely')

    expect(getTitleDraft()).toBe('Login fix')
    expect(getBranchDraft()).toBe('login-fix')
  })

  it('slugs a hand-typed branch but re-derives it on the next title change', () => {
    expect(setBranchDraft('My Branch')).toBe('my-branch')
    expect(getBranchDraft()).toBe('my-branch')

    setTitleDraft('new title')

    expect(getBranchDraft()).toBe('new-title')
  })

  it('keeps a trailing dash while the branch is being typed', () => {
    expect(liveSlug('fix-')).toBe('fix-')
    expect(liveSlug('  Fix Login ')).toBe('fix-login-')
  })

  it('files the ticket with the custom title and the sanitized branch slug', async () => {
    projects.push(project('p1', 'alpha', 'ALP'))
    await store.refresh()
    setTitleDraft('Login fix')
    setBranchDraft('login-flow-')

    await store.submit('rework the whole login flow')

    const task = upsert.mock.calls[0][0] as DailyPlanTask
    expect(task.title).toBe('Login fix')
    expect(task.description).toBe('rework the whole login flow')
    expect(task.worktreeSlug).toBe('login-flow')
  })

  it('falls back to the prompt head when the title was emptied', async () => {
    projects.push(project('p1', 'alpha', 'ALP'))
    await store.refresh()
    setTitleDraft('')

    await store.submit('fix the header')

    const task = upsert.mock.calls[0][0] as DailyPlanTask
    expect(task.title).toBe('fix the header')
    expect(task.worktreeSlug).toBeUndefined()
  })

  it('resets the drafts once the ticket is filed, restoring the prompt bond', async () => {
    projects.push(project('p1', 'alpha', 'ALP'))
    await store.refresh()
    setTitleDraft('Login fix')

    await store.submit('rework the login flow')

    expect(getTitleDraft()).toBe('')
    expect(getBranchDraft()).toBe('')
    syncTitleFromPrompt('next piece of work')
    expect(getTitleDraft()).toBe('next piece of work')
  })

  it('seeds the meta inputs from the drafts', () => {
    const title = document.createElement('input')
    const branch = document.createElement('input')
    setTitleDraft('Login fix')

    seedMetaInto(title, branch)

    expect(title.value).toBe('Login fix')
    expect(branch.value).toBe('login-fix')
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
    tags.length = 0
    store.clearLabels()
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

  it('lists the labels and marks the ones already on the ticket', () => {
    tags.push(tag('t1', 'urgent'), tag('t2', 'design'))

    expect(slashItemsFor('urg')[0]).toMatchObject({ kind: 'label', labelId: 't1', isOn: false })
    expect(slashItemsFor('urg', ['t1'])[0]).toMatchObject({ labelId: 't1', isOn: true })
    expect(slashItemsFor('design').map((i) => i.label)).toEqual(['design'])
  })

  it('picking "/urgent" toggles the label on, then off, and cuts the token out', () => {
    tags.push(tag('t1', 'urgent'))
    const text = 'fix the header /urgent'
    store.syncSlash(text, text.length)

    const next = store.applySlash(store.activeSlashItem!, text, text.length)

    expect(store.labelIds).toEqual(['t1'])
    expect(next).toEqual({ text: 'fix the header ', caret: 15 })
    expect(store.isSlashOpen).toBe(false)

    store.applySlash(slashItemsFor('urgent', store.labelIds)[0], '/urgent', 7)
    expect(store.labelIds).toEqual([])
  })

  it('re-renders the menu when a listed label is toggled elsewhere', () => {
    tags.push(tag('t1', 'urgent'))
    store.syncSlash('/urgent', 7)
    expect(store.slashItems[0].isOn).toBe(false)

    store.toggleLabel('t1')
    store.syncSlash('/urgent', 7)

    expect(store.slashItems[0].isOn).toBe(true)
  })
})

describe('the composer labels', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    projects.length = 0
    tags.length = 0
    store.clearLabels()
    branchesAt.mockResolvedValue([])
    setDraft('')
  })

  it('toggles a label on and off', () => {
    store.toggleLabel('t1')
    store.toggleLabel('t2')
    expect(store.labelIds).toEqual(['t1', 't2'])
    expect(store.isLabelOn('t1')).toBe(true)

    store.toggleLabel('t1')
    expect(store.labelIds).toEqual(['t2'])
    expect(store.isLabelOn('t1')).toBe(false)
  })

  it('files the ticket with the picked labels as its tags', async () => {
    projects.push(project('p1', 'alpha', 'ALP'))
    tags.push(tag('t1', 'urgent'), tag('t2', 'design'))
    await store.refresh()
    store.toggleLabel('t2')

    await store.submit('fix the header')

    const task = upsert.mock.calls[0][0] as DailyPlanTask
    expect(task.tagIds).toEqual(['t2'])
  })

  it('snapshots the labels on refresh and drops a picked one that was deleted', async () => {
    projects.push(project('p1', 'alpha', 'ALP'))
    tags.push(tag('t1', 'urgent'), tag('t2', 'design'))
    await store.refresh()
    store.toggleLabel('t1')
    store.toggleLabel('t2')
    expect(store.labels.map((t) => t.name)).toEqual(['urgent', 'design'])

    tags.splice(0, 1) // "urgent" deleted on the board
    await store.refresh()

    expect(store.labelIds).toEqual(['t2'])
    expect(store.selectedLabels.map((t) => t.name)).toEqual(['design'])
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { DailyPlanTask, ProjectNode } from '@views/types/types'

const ensureWorktreeForBranch = vi.fn()
const openClaudeWithPrompt = vi.fn()
const upsert = vi.fn()
const setStep = vi.fn()
const fail = vi.fn()
const closeProgress = vi.fn()

const projects: ProjectNode[] = []

vi.mock('@views/state/spine', () => ({ state: { tree: [] } }))
vi.mock('@repositories', () => ({
  dailyTaskRepo: { getAll: () => [], upsert: (t: DailyPlanTask) => upsert(t) }
}))
vi.mock('@views/catalog/catalog', () => ({
  findProjectById: (_tree: unknown, id: string) => projects.find((p) => p.id === id) ?? null
}))
vi.mock('@views/commands/commands', () => ({
  openClaudeWithPrompt: (...args: unknown[]) => openClaudeWithPrompt(...args)
}))
vi.mock('@services/worktrees', () => ({
  ensureWorktreeForBranch: (...args: unknown[]) => ensureWorktreeForBranch(...args)
}))
vi.mock('@views/components/worktree-progress/worktree-progress', () => ({
  showWorktreeProgress: () => ({ setStep, fail, close: closeProgress })
}))
vi.mock('@views/components/dialog/confirm', () => ({ promptConfirm: async () => true }))
vi.mock('@views/components/overlay/overlay', () => ({ createOverlay: () => ({}) }))
vi.mock('@views/screens/daily-plan/daily-plan.store', () => ({
  todayKey: () => '2026-07-13',
  tasksFor: () => [],
  assignIssueKey: (t: DailyPlanTask) => (t.projectId ? 'CRF-1' : null),
  worktreeBranchForTask: (_t: DailyPlanTask, key: string) => key,
  rangeStartKey: () => '2026-07-13',
  default: { setSelectedDate: () => {}, reload: () => {} }
}))
vi.mock('@views/screens/daily-plan/components/task-form.open', () => ({ openTaskForm: () => {} }))
vi.mock('@views/screens/daily-plan/components/tag-filter-popover', () => ({ openTagFilterPopover: () => {} }))
vi.mock('@views/screens/daily-plan/components/daily-compact', () => ({ renderDailyCompactView: () => {} }))
vi.mock('@views/screens/daily-plan/components/daily-compact.store', () => ({ default: { range: 'day' } }))
vi.mock('@views/screens/daily-plan/components/daily-plan-modal', () => ({ default: class {} }))

const { openTaskInTerminal } = await import('@views/screens/daily-plan/daily-plan.entry')

function task(): DailyPlanTask {
  return {
    id: 't1',
    title: 'add a settings screen',
    status: 'todo',
    priority: 'medium',
    date: '2026-07-13',
    order: 0,
    tagIds: [],
    projectId: 'p1',
    createdAt: 0,
    updatedAt: 0
  } as DailyPlanTask
}

describe('openTaskInTerminal — worktree run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projects.length = 0
    projects.push({
      kind: 'project',
      id: 'p1',
      name: 'crafterm',
      path: '/repos/crafterm',
      issueKeyPrefix: 'CRF',
      children: []
    } as unknown as ProjectNode)
    fail.mockResolvedValue(undefined)
  })

  it('leaves the ticket alone when the worktree could not be created (todomr4q102cd9)', async () => {
    ensureWorktreeForBranch.mockResolvedValue({ ok: false, error: 'fatal: CRF-1 is already checked out' })
    const t = task()

    await openTaskInTerminal(t, () => {}, true)

    expect(t.status).toBe('todo')
    expect(openClaudeWithPrompt).not.toHaveBeenCalled()
    // The failure is shown on the progress overlay, with git's own words.
    expect(fail).toHaveBeenCalledWith('fatal: CRF-1 is already checked out')
    expect(closeProgress).not.toHaveBeenCalled()
  })

  it('moves the ticket to In Progress once the worktree is up and the terminal starts', async () => {
    ensureWorktreeForBranch.mockResolvedValue({ ok: true, path: '/repos/worktrees/CRF-1', nodeId: 'w1' })
    const t = task()

    await openTaskInTerminal(t, () => {}, true, { base: 'develop' })

    expect(ensureWorktreeForBranch).toHaveBeenCalledWith(
      projects[0],
      'CRF-1',
      'develop',
      expect.any(Function)
    )
    expect(t.status).toBe('wip')
    expect(upsert).toHaveBeenCalledWith(t)
    // The terminal opens under the SAME name as the worktree (the branch).
    expect(openClaudeWithPrompt).toHaveBeenCalledWith(
      'w1',
      '/repos/worktrees/CRF-1',
      expect.stringContaining('add a settings screen'),
      'CRF-1',
      't1',
      undefined
    )
    expect(setStep).toHaveBeenCalledWith('opening')
    expect(closeProgress).toHaveBeenCalledTimes(1)
  })

  it('titles a local run by the task title, not a branch', async () => {
    const t = task()

    await openTaskInTerminal(t, () => {}, false)

    expect(openClaudeWithPrompt).toHaveBeenCalledWith(
      'p1',
      '/repos/crafterm',
      expect.stringContaining('add a settings screen'),
      'add a settings screen',
      't1',
      undefined
    )
  })

  it('runs a local ticket without touching the worktree machinery', async () => {
    const t = task()

    await openTaskInTerminal(t, () => {}, false)

    expect(ensureWorktreeForBranch).not.toHaveBeenCalled()
    expect(t.status).toBe('wip')
    expect(openClaudeWithPrompt).toHaveBeenCalled()
  })
})

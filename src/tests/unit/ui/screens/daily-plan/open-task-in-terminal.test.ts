import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { DailyPlanTask, ProjectNode } from '@views/types/types'

const createWorktreeInTerminal = vi.fn()
const openClaudeWithPrompt = vi.fn()
const upsert = vi.fn()

const projects: ProjectNode[] = []

vi.mock('@views/state/spine', () => ({ state: { tree: [] } }))
vi.mock('@repositories', () => ({
  dailyTaskRepo: { getAll: () => [], upsert: (t: DailyPlanTask) => upsert(t) }
}))
vi.mock('@views/catalog/catalog', () => ({
  findProjectById: (_tree: unknown, id: string) => projects.find((p) => p.id === id) ?? null
}))
vi.mock('@views/commands/commands', () => ({
  openClaudeWithPrompt: (...args: unknown[]) => openClaudeWithPrompt(...args),
  createWorktreeInTerminal: (...args: unknown[]) => createWorktreeInTerminal(...args)
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
    // The shared flow reports the terminal being up; the ticket moves on that.
    createWorktreeInTerminal.mockImplementation(async (opts: { onTerminalOpened?: () => void }) => {
      opts.onTerminalOpened?.()
      return { worktreePath: '/repos/worktrees/CRF-1', nodeId: 'w1', paneId: 'pane1', existed: false }
    })
  })

  it('runs the ticket through the shared worktree flow, seeded with the Claude prompt', async () => {
    const t = task()

    await openTaskInTerminal(t, () => {}, true, { base: 'develop' })

    const opts = createWorktreeInTerminal.mock.calls[0][0]
    expect(opts).toMatchObject({
      project: projects[0],
      repoRoot: '/repos/crafterm',
      branch: 'CRF-1',
      base: 'develop',
      placement: 'tab',
      parentFolderId: 'p1',
      // The terminal carries the SAME name as the worktree (the branch).
      title: 'CRF-1',
      titleLocked: true,
      dailyTaskId: 't1'
    })
    expect(opts.claudePrompt).toContain('add a settings screen')
    // Claude runs in that same terminal — no separate pane.
    expect(openClaudeWithPrompt).not.toHaveBeenCalled()
  })

  it('moves the ticket to In Progress as soon as the terminal is up', async () => {
    const t = task()

    await openTaskInTerminal(t, () => {}, true)

    expect(t.status).toBe('wip')
    expect(upsert).toHaveBeenCalledWith(t)
  })

  it('leaves the ticket alone when the terminal never opened', async () => {
    createWorktreeInTerminal.mockResolvedValue({
      worktreePath: '/repos/worktrees/CRF-1',
      nodeId: null,
      paneId: null,
      existed: false
    })
    const t = task()

    await openTaskInTerminal(t, () => {}, true)

    expect(t.status).toBe('todo')
    expect(upsert).not.toHaveBeenCalled()
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

    expect(createWorktreeInTerminal).not.toHaveBeenCalled()
    expect(t.status).toBe('wip')
    expect(openClaudeWithPrompt).toHaveBeenCalled()
  })
})

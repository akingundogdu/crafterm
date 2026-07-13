import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { DailyPlanTask } from '@views/types/types'
import { shiftDays, ymd } from '@views/screens/daily-plan/task-helpers'

const today = ymd(new Date())

function task(id: string, date: string): DailyPlanTask {
  return {
    id,
    title: id,
    description: '',
    status: 'todo',
    priority: 'medium',
    date,
    order: 0,
    tagIds: [],
    projectId: null,
    createdAt: 0,
    updatedAt: 0
  } as DailyPlanTask
}

const tasks: DailyPlanTask[] = [
  task('today', today),
  task('two-days-ago', shiftDays(today, -2)),
  task('ten-days-ago', shiftDays(today, -10)),
  task('long-ago', shiftDays(today, -400))
]

vi.mock('@repositories', () => ({
  dailyTaskRepo: { getAll: () => tasks },
  dailyTagRepo: { getAll: () => [] }
}))

// The store pulls the shared tag filter from the entry module, which drags in the
// whole board orchestration (overlays, commands, services). Stub it to the Set only.
vi.mock('@views/screens/daily-plan/daily-plan.entry', () => ({ tagFilter: new Set<string>() }))

const { default: store } = await import('@views/screens/daily-plan/daily-plan.store')

describe('DailyPlanStore.scopedTasks', () => {
  beforeEach(() => {
    store.reload()
    store.setSelectedDate(today)
    store.setProjectFilter(null)
  })

  it('scopes to the selected day', () => {
    store.setRange('day')
    expect(store.scopedTasks.map((t) => t.id)).toEqual(['today'])
  })

  it('scopes to the last N days up to today', () => {
    store.setRange('3d')
    expect(store.scopedTasks.map((t) => t.id)).toEqual(['today', 'two-days-ago'])
    store.setRange('7d')
    expect(store.scopedTasks.map((t) => t.id)).toEqual(['today', 'two-days-ago'])
  })

  it('widens to two weeks and one month', () => {
    store.setRange('7d')
    expect(store.scopedTasks.map((t) => t.id)).toEqual(['today', 'two-days-ago'])
    store.setRange('14d')
    expect(store.scopedTasks.map((t) => t.id)).toEqual(['today', 'two-days-ago', 'ten-days-ago'])
    store.setRange('30d')
    expect(store.scopedTasks.map((t) => t.id)).toEqual(['today', 'two-days-ago', 'ten-days-ago'])
  })

  it('lists every task regardless of date for the all range', () => {
    store.setRange('all')
    expect(store.scopedTasks.map((t) => t.id)).toEqual(['today', 'two-days-ago', 'ten-days-ago', 'long-ago'])
  })
})

import { describe, it, expect, vi } from 'vitest'
import { dailyTaskSchema, makeDailyTask, type DailyTask } from '@models/daily-task'
import { makeDailyTag, dailyTagSchema } from '@models/daily-tag'
import { createArrayRepository } from '@repositories/repository'

describe('daily-task model', () => {
  it('makeDailyTask fills defaults and validates', () => {
    const t = makeDailyTask({ title: 'X', date: '2026-06-15' })
    expect(t.status).toBe('backlog')
    expect(t.priority).toBe('medium')
    expect(t.tagIds).toEqual([])
    expect(t.order).toBe(0)
    expect(typeof t.id).toBe('string')
    expect(dailyTaskSchema.safeParse(t).success).toBe(true)
  })

  it('schema rejects an invalid status', () => {
    const bad = { ...makeDailyTask({ title: 'X', date: 'd' }), status: 'nope' }
    expect(dailyTaskSchema.safeParse(bad).success).toBe(false)
  })
})

describe('daily-tag model', () => {
  it('makeDailyTag validates', () => {
    expect(dailyTagSchema.safeParse(makeDailyTag({ name: 'urgent', color: '#f00' })).success).toBe(
      true
    )
  })
})

describe('createArrayRepository', () => {
  it('upserts, gets, queries and removes with persist + validation', () => {
    const arr: DailyTask[] = []
    const persist = vi.fn()
    const repo = createArrayRepository<DailyTask>(
      () => arr,
      persist,
      (r) => dailyTaskSchema.parse(r)
    )

    const t = makeDailyTask({ title: 'A', date: 'd' })
    repo.upsert(t)
    expect(repo.getAll()).toHaveLength(1)
    expect(repo.get(t.id)?.title).toBe('A')

    repo.upsert({ ...t, title: 'B' }) // same id -> update, not insert
    expect(repo.getAll()).toHaveLength(1)
    expect(repo.get(t.id)?.title).toBe('B')
    expect(repo.query((x) => x.title === 'B')).toHaveLength(1)

    repo.remove(t.id)
    expect(repo.getAll()).toHaveLength(0)
    expect(persist).toHaveBeenCalledTimes(3) // 2 upserts + 1 remove
  })
})

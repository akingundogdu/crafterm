import { describe, it, expect, vi } from 'vitest'
import { createArrayRepository, validated } from '@services/storage/repositories/repository'

interface Row {
  id: string
  name: string
}

describe('createArrayRepository', () => {
  it('CRUD against a live array, persisting after each write', () => {
    const arr: Row[] = []
    const persist = vi.fn()
    const repo = createArrayRepository<Row>(() => arr, persist)

    repo.upsert({ id: 'a', name: 'A' })
    repo.upsert({ id: 'b', name: 'B' })
    expect(repo.getAll().map((r) => r.id)).toEqual(['a', 'b']) // append by default
    expect(persist).toHaveBeenCalledTimes(2)

    repo.upsert({ id: 'a', name: 'A2' }) // update in place, keep position
    expect(repo.get('a')).toEqual({ id: 'a', name: 'A2' })
    expect(repo.getAll().map((r) => r.id)).toEqual(['a', 'b'])

    expect(repo.query((r) => r.name.includes('B'))).toEqual([{ id: 'b', name: 'B' }])

    repo.remove('a')
    expect(repo.get('a')).toBeUndefined()
    expect(persist).toHaveBeenCalledTimes(4)

    repo.remove('missing') // no-op, no persist
    expect(persist).toHaveBeenCalledTimes(4)
  })

  it('prepend inserts new rows at the front but updates in place', () => {
    const arr: Row[] = []
    const repo = createArrayRepository<Row>(() => arr, () => {}, { prepend: true })
    repo.upsert({ id: 'a', name: 'A' })
    repo.upsert({ id: 'b', name: 'B' })
    expect(repo.getAll().map((r) => r.id)).toEqual(['b', 'a']) // newest first
    repo.upsert({ id: 'a', name: 'A2' }) // update keeps its slot, no re-prepend
    expect(repo.getAll().map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('a bare function is treated as the validator (back-compat)', () => {
    const arr: Row[] = []
    const validate = vi.fn((r: Row) => r)
    const repo = createArrayRepository<Row>(() => arr, () => {}, validate)
    repo.upsert({ id: 'a', name: 'A' })
    expect(validate).toHaveBeenCalledOnce()
  })
})

describe('validated', () => {
  it('returns the row unchanged and never throws, even when invalid', () => {
    const schema = { safeParse: (row: unknown) => ({ success: false, error: 'bad' }) }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const v = validated<Row>(schema, 'row')
    const row = { id: 'a', name: 'A', extra: 1 } as Row
    expect(v(row)).toBe(row) // same reference, no key stripping
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('does not warn on a valid row', () => {
    const schema = { safeParse: () => ({ success: true }) }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    validated<Row>(schema, 'row')({ id: 'a', name: 'A' })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

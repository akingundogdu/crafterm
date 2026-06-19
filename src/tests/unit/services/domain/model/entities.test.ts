import { describe, it, expect } from 'vitest'
import { reminderSchema, reminderPayloadSchema, makeReminder } from '@services/domain/model/reminder'
import { bookmarkSchema, makeBookmark } from '@services/domain/model/bookmark'
import { timeEntrySchema, makeTimeEntry } from '@services/domain/model/time-entry'
import { meetingNoteSchema, makeMeetingNote } from '@services/domain/model/meeting-note'
import { accountEntrySchema, makeAccountEntry } from '@services/domain/model/account'

describe('reminder', () => {
  it('makeReminder validates with defaults (repeat=none, enabled=true)', () => {
    const r = makeReminder({ text: 'standup', time: 123 })
    expect(r.repeat).toBe('none')
    expect(r.enabled).toBe(true)
    expect(reminderSchema.safeParse(r).success).toBe(true)
  })
  it('accepts a discriminated payload and rejects an unknown kind', () => {
    expect(reminderPayloadSchema.safeParse({ kind: 'bookmark', bookmarkId: 'b1' }).success).toBe(true)
    expect(reminderPayloadSchema.safeParse({ kind: 'nope', x: 1 }).success).toBe(false)
  })
  it('rejects an invalid repeat', () => {
    expect(reminderSchema.safeParse({ ...makeReminder({ text: 't', time: 1 }), repeat: 'x' }).success).toBe(false)
  })
})

describe('bookmark', () => {
  it('validates make + rejects bad type', () => {
    expect(bookmarkSchema.safeParse(makeBookmark({ type: 'link', title: 'T', content: 'u' })).success).toBe(true)
    expect(
      bookmarkSchema.safeParse({ id: '1', type: 'x', title: 'T', content: 'u', tags: [], createdAt: 1 }).success
    ).toBe(false)
  })
})

describe('time-entry', () => {
  it('validates make', () => {
    expect(timeEntrySchema.safeParse(makeTimeEntry({ projectPath: '/p', start: 1, end: 2, source: 'manual' })).success).toBe(true)
  })
})

describe('meeting-note', () => {
  it('validates make with defaults', () => {
    const n = makeMeetingNote({ title: 'Sync', date: '2026-06-15' })
    expect(n.attendees).toEqual([])
    expect(meetingNoteSchema.safeParse(n).success).toBe(true)
  })
})

describe('account', () => {
  it('validates make + a secret field', () => {
    const a = makeAccountEntry({
      kind: 'account',
      label: 'GitHub',
      fields: [{ key: 'token', secret: true }]
    })
    expect(accountEntrySchema.safeParse(a).success).toBe(true)
    expect(a.fields[0].secret).toBe(true)
  })
})

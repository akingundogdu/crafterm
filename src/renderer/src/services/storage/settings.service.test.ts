// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadSettings } from './settings.service'
import { settings } from '../../state'
import type { SavedState } from '../../../../preload/api'

// Minimal SavedState; only the fields under test are populated. Everything else
// is guarded in loadSettings and left at its default.
const saved = (patch: Partial<SavedState>): SavedState => patch as SavedState

beforeEach(() => {
  settings.bookmarks = []
  settings.reminders = []
  settings.timeEntries = []
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('loadSettings validation boundary (Phase 2 / F)', () => {
  it('keeps valid entity rows and drops malformed ones', () => {
    loadSettings(
      saved({
        bookmarks: [
          { id: 'b1', type: 'link', title: 'ok', content: 'http://x', tags: [], createdAt: 1 },
          { id: 'bad' }, // missing required fields
          { id: 'b2', type: 'text', title: 'ok2', content: 'hi', tags: ['t'], createdAt: 2 }
        ] as unknown as SavedState['bookmarks']
      })
    )
    expect(settings.bookmarks.map((b) => b.id)).toEqual(['b1', 'b2'])
  })

  it('drops malformed reminders without crashing', () => {
    loadSettings(
      saved({
        reminders: [
          { id: 'r1', text: 'do', time: 100, repeat: 'none', enabled: true },
          { nope: true } // not a reminder
        ] as unknown as SavedState['reminders']
      })
    )
    expect(settings.reminders.map((r) => r.id)).toEqual(['r1'])
  })

  it('a non-array entity field leaves the default untouched (no crash)', () => {
    settings.bookmarks = [
      { id: 'keep', type: 'link', title: 'x', content: 'y', tags: [], createdAt: 0 }
    ]
    loadSettings(saved({ bookmarks: 'corrupt' as unknown as SavedState['bookmarks'] }))
    expect(settings.bookmarks.map((b) => b.id)).toEqual(['keep'])
  })

  it('an entirely malformed state loads without throwing', () => {
    expect(() =>
      loadSettings(
        saved({
          timeEntries: 'nope' as unknown as SavedState['timeEntries'],
          reminders: [42, null, 'x'] as unknown as SavedState['reminders']
        })
      )
    ).not.toThrow()
    expect(settings.reminders).toEqual([])
  })
})

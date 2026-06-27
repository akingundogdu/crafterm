// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadSettings } from '@repositories/settings.service'
import { settings } from '@ui/state/state'
import { bookmarks, setBookmarks } from '@ui/state/collections/bookmarks'
import { reminders, setReminders } from '@ui/state/collections/reminders'
import { setTimeEntries } from '@ui/state/collections/time-entries'
import type { SavedState } from '@repositories/state.types'

// Minimal SavedState; only the fields under test are populated. Everything else
// is guarded in loadSettings and left at its default.
const saved = (patch: Partial<SavedState>): SavedState => patch as SavedState

beforeEach(() => {
  setBookmarks([])
  setReminders([])
  setTimeEntries([])
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
    expect(bookmarks.map((b) => b.id)).toEqual(['b1', 'b2'])
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
    expect(reminders.map((r) => r.id)).toEqual(['r1'])
  })

  it('a non-array entity field leaves the default untouched (no crash)', () => {
    setBookmarks([
      { id: 'keep', type: 'link', title: 'x', content: 'y', tags: [], createdAt: 0 }
    ])
    loadSettings(saved({ bookmarks: 'corrupt' as unknown as SavedState['bookmarks'] }))
    expect(bookmarks.map((b) => b.id)).toEqual(['keep'])
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
    expect(reminders).toEqual([])
  })
})

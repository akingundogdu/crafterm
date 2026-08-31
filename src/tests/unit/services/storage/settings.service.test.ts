// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadSettings } from '@repositories/settings.service'
import { settings, applySidebarSelectedColor } from '@views/state/state'
import { bookmarks, setBookmarks } from '@models/bookmark'
import { reminders, setReminders } from '@models/reminder'
import { setTimeEntries } from '@models/time-entry'
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

describe('sidebarSelectedColor setting', () => {
  it('loads a saved sidebarSelectedColor string', () => {
    loadSettings(saved({ sidebarSelectedColor: '#00ff00' }))
    expect(settings.sidebarSelectedColor).toBe('#00ff00')
  })

  it('ignores a missing or non-string sidebarSelectedColor', () => {
    settings.sidebarSelectedColor = '#ff9500'
    loadSettings(saved({}))
    expect(settings.sidebarSelectedColor).toBe('#ff9500')
    loadSettings(saved({ sidebarSelectedColor: 42 as unknown as string }))
    expect(settings.sidebarSelectedColor).toBe('#ff9500')
    loadSettings(saved({ sidebarSelectedColor: '' }))
    expect(settings.sidebarSelectedColor).toBe('#ff9500')
  })

  it('applySidebarSelectedColor writes the CSS variable to the document root', () => {
    settings.sidebarSelectedColor = '#123456'
    applySidebarSelectedColor()
    expect(document.documentElement.style.getPropertyValue('--sidebar-selected-border')).toBe('#123456')
  })
})

describe('sidebar selected background + text settings', () => {
  it('loads saved background/text colors, blank included', () => {
    loadSettings(saved({ sidebarSelectedBg: '#101827', sidebarSelectedText: '#f5f7fa' }))
    expect(settings.sidebarSelectedBg).toBe('#101827')
    expect(settings.sidebarSelectedText).toBe('#f5f7fa')
    // Blank is a real value here — it means "fall back to the theme default".
    loadSettings(saved({ sidebarSelectedBg: '', sidebarSelectedText: '' }))
    expect(settings.sidebarSelectedBg).toBe('')
    expect(settings.sidebarSelectedText).toBe('')
  })

  it('ignores missing or non-string background/text colors', () => {
    settings.sidebarSelectedBg = '#101827'
    settings.sidebarSelectedText = '#f5f7fa'
    loadSettings(saved({}))
    expect(settings.sidebarSelectedBg).toBe('#101827')
    expect(settings.sidebarSelectedText).toBe('#f5f7fa')
    loadSettings(
      saved({
        sidebarSelectedBg: 7 as unknown as string,
        sidebarSelectedText: null as unknown as string
      })
    )
    expect(settings.sidebarSelectedBg).toBe('#101827')
    expect(settings.sidebarSelectedText).toBe('#f5f7fa')
  })

  it('applySidebarSelectedColor writes both variables when set', () => {
    settings.sidebarSelectedBg = '#101827'
    settings.sidebarSelectedText = '#f5f7fa'
    applySidebarSelectedColor()
    expect(document.documentElement.style.getPropertyValue('--sidebar-selected-bg')).toBe('#101827')
    expect(document.documentElement.style.getPropertyValue('--sidebar-selected-text')).toBe('#f5f7fa')
  })

  it('applySidebarSelectedColor removes a variable when its setting is blank', () => {
    settings.sidebarSelectedBg = '#101827'
    settings.sidebarSelectedText = '#f5f7fa'
    applySidebarSelectedColor()
    settings.sidebarSelectedBg = ''
    settings.sidebarSelectedText = ''
    applySidebarSelectedColor()
    expect(document.documentElement.style.getPropertyValue('--sidebar-selected-bg')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--sidebar-selected-text')).toBe('')
    // The border color is unconditional and must survive a blank override.
    expect(document.documentElement.style.getPropertyValue('--sidebar-selected-border')).toBeTruthy()
  })
})

describe('active terminal card background + text settings', () => {
  it('loads saved active colors, blank included', () => {
    loadSettings(saved({ sidebarActiveBg: '#2b3a55', sidebarActiveText: '#eef3ff' }))
    expect(settings.sidebarActiveBg).toBe('#2b3a55')
    expect(settings.sidebarActiveText).toBe('#eef3ff')
    loadSettings(saved({ sidebarActiveBg: '', sidebarActiveText: '' }))
    expect(settings.sidebarActiveBg).toBe('')
    expect(settings.sidebarActiveText).toBe('')
  })

  it('ignores missing or non-string active colors', () => {
    settings.sidebarActiveBg = '#2b3a55'
    settings.sidebarActiveText = '#eef3ff'
    loadSettings(saved({}))
    expect(settings.sidebarActiveBg).toBe('#2b3a55')
    expect(settings.sidebarActiveText).toBe('#eef3ff')
    loadSettings(
      saved({
        sidebarActiveBg: 9 as unknown as string,
        sidebarActiveText: null as unknown as string
      })
    )
    expect(settings.sidebarActiveBg).toBe('#2b3a55')
    expect(settings.sidebarActiveText).toBe('#eef3ff')
  })

  it('applySidebarSelectedColor writes and clears the active variables', () => {
    settings.sidebarActiveBg = '#2b3a55'
    settings.sidebarActiveText = '#eef3ff'
    applySidebarSelectedColor()
    expect(document.documentElement.style.getPropertyValue('--sidebar-active-bg')).toBe('#2b3a55')
    expect(document.documentElement.style.getPropertyValue('--sidebar-active-text')).toBe('#eef3ff')
    settings.sidebarActiveBg = ''
    settings.sidebarActiveText = ''
    applySidebarSelectedColor()
    expect(document.documentElement.style.getPropertyValue('--sidebar-active-bg')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--sidebar-active-text')).toBe('')
  })
})
